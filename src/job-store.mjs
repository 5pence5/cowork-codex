import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

const RUNNING_STATES = new Set(["queued", "running"]);
const TERMINAL_STATES = new Set(["completed", "failed", "cancelled", "rejected"]);

function nowIso() {
  return new Date().toISOString();
}

function elapsedMs(job) {
  const start = Date.parse(job.startedAt || job.createdAt);
  const end = job.endedAt ? Date.parse(job.endedAt) : Date.now();
  return Number.isFinite(start) ? Math.max(0, end - start) : 0;
}

function pidAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function signalProcessGroup(pid, signal) {
  if (!pid) return false;
  try {
    process.kill(-pid, signal);
    return true;
  } catch {
    try {
      process.kill(pid, signal);
      return true;
    } catch {
      return false;
    }
  }
}

function signalThenEscalate(pid) {
  if (!pid || !pidAlive(pid)) return false;
  const signalled = signalProcessGroup(pid, "SIGTERM");
  setTimeout(() => {
    if (pidAlive(pid)) signalProcessGroup(pid, "SIGKILL");
  }, 2000).unref();
  return signalled;
}

function makeJobId() {
  const rand = Math.random().toString(36).slice(2, 8);
  return `job-${Date.now().toString(36)}-${rand}`;
}

async function appendJsonl(path, obj) {
  await mkdir(dirname(path), { recursive: true });
  await appendFile(path, `${JSON.stringify(obj)}\n`, "utf8");
}

function applyRecord(jobs, record) {
  if (record.type === "job.created") {
    jobs.set(record.job.id, record.job);
    return;
  }
  if (record.type === "job.updated") {
    const existing = jobs.get(record.id) || { id: record.id };
    jobs.set(record.id, { ...existing, ...record.patch });
  }
}

export class JobStore {
  constructor(rootDir, options = {}) {
    this.rootDir = rootDir;
    this.logsDir = options.logsDir || defaultLogsDir(rootDir);
    this.jobsPath = join(this.logsDir, "jobs.jsonl");
    this.jobs = new Map();
    this.processes = new Map();
  }

  async init() {
    await mkdir(this.logsDir, { recursive: true });
    if (existsSync(this.jobsPath)) {
      const raw = await readFile(this.jobsPath, "utf8");
      for (const line of raw.split(/\r?\n/)) {
        if (!line.trim()) continue;
        try {
          applyRecord(this.jobs, JSON.parse(line));
        } catch {
          // Ignore corrupt historical lines; raw file remains available for audit.
        }
      }
    }
    await this.sweepOrphans();
  }

  async sweepOrphans() {
    for (const job of this.jobs.values()) {
      if (RUNNING_STATES.has(job.status)) {
        if (job.ownerPid && pidAlive(job.ownerPid)) {
          continue;
        }
        const signalled = signalThenEscalate(job.pid);
        await this.update(job.id, {
          status: "failed",
          phase: "orphaned",
          endedAt: nowIso(),
          errorKind: "other",
          errorMessage: signalled
            ? "Job was active during MCP server restart; the stored child process was signalled and the job was marked orphaned."
            : "Job was active during MCP server restart; no supervised child process was available and the job was marked orphaned.",
          pid: null
        });
      }
    }
  }

  activeJobs() {
    return [...this.jobs.values()].filter((job) => RUNNING_STATES.has(job.status));
  }

  activeCount() {
    return this.activeJobs().length;
  }

  async create(input) {
    const id = makeJobId();
    const paths = {
      events: join(this.logsDir, `${id}.events.jsonl`),
      out: join(this.logsDir, `${id}.out.log`),
      err: join(this.logsDir, `${id}.err.log`)
    };
    const job = {
      id,
      status: "queued",
      phase: "queued",
      createdAt: nowIso(),
      updatedAt: nowIso(),
      type: input.type,
      cwd: input.cwd,
      originalCwd: input.originalCwd,
      profile: input.profile,
      sandbox: input.sandbox,
      model: input.model || null,
      effort: input.effort || null,
      promptPreview: input.prompt ? `[omitted ${input.prompt.length} chars]` : "",
      reviewMode: input.reviewMode || null,
      reviewTarget: null,
      threadId: input.threadId || null,
      resumeThreadId: input.resumeThreadId || null,
      ownerPid: null,
      pid: null,
      exitCode: null,
      signal: null,
      errorKind: null,
      errorMessage: null,
      finalMessage: null,
      usage: null,
      recentItems: [],
      logs: paths
    };
    this.jobs.set(id, job);
    await appendJsonl(this.jobsPath, { type: "job.created", at: nowIso(), job });
    await writeFile(paths.out, "", "utf8");
    await writeFile(paths.err, "", "utf8");
    await writeFile(paths.events, "", "utf8");
    return job;
  }

  async update(id, patch) {
    const existing = this.jobs.get(id);
    if (!existing) throw new Error(`Unknown job id: ${id}`);
    const next = { ...existing, ...patch, updatedAt: nowIso() };
    this.jobs.set(id, next);
    await appendJsonl(this.jobsPath, { type: "job.updated", at: nowIso(), id, patch: { ...patch, updatedAt: next.updatedAt } });
    return next;
  }

  attachProcess(id, proc) {
    this.processes.set(id, proc);
  }

  getProcess(id) {
    return this.processes.get(id);
  }

  detachProcess(id) {
    this.processes.delete(id);
  }

  get(id) {
    return this.jobs.get(id) || null;
  }

  listRecent(limit = 10) {
    return [...this.jobs.values()]
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .slice(0, limit);
  }

  latestCompletedForWorkspace(cwd) {
    return [...this.jobs.values()]
      .filter((job) => job.cwd === cwd && job.status === "completed" && job.threadId)
      .sort((a, b) => String(b.endedAt || b.updatedAt).localeCompare(String(a.endedAt || a.updatedAt)))[0] || null;
  }

  // Only threads this bridge itself created for THIS workspace may be resumed by
  // an explicit id, so caller text cannot point the bridge at an unrelated
  // workspace conversation.
  findByThreadIdForWorkspace(threadId, cwd) {
    if (!threadId) return null;
    return [...this.jobs.values()]
      .find((job) => job.threadId === threadId && job.cwd === cwd) || null;
  }

  async appendRawEvent(job, event) {
    await appendJsonl(job.logs.events, event);
  }

  async appendOut(job, text) {
    await appendFile(job.logs.out, text, "utf8");
  }

  async appendErr(job, text) {
    await appendFile(job.logs.err, text, "utf8");
  }

  summarize(job) {
    return {
      id: job.id,
      type: job.type,
      status: job.status,
      phase: job.phase,
      cwd: job.cwd,
      profile: job.profile,
      sandbox: job.sandbox,
      model: job.model,
      effort: job.effort,
      reviewMode: job.reviewMode,
      reviewTarget: job.reviewTarget || null,
      pid: job.pid,
      threadId: job.threadId,
      elapsedMs: elapsedMs(job),
      errorKind: job.errorKind,
      errorMessage: job.errorMessage,
      progressPreview: job.recentItems || [],
      finalMessagePreview: job.finalMessage ? job.finalMessage.slice(0, 500) : null,
      usage: job.usage || null,
      logs: job.logs
    };
  }

  isTerminal(job) {
    return TERMINAL_STATES.has(job?.status);
  }
}

export function defaultLogsDir(rootDir) {
  return resolve(homedir(), ".local", "state", "cowork-codex", "logs");
}
