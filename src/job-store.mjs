import { appendFile, chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { defaultLogsPath } from "./platform.mjs";

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

function makeJobId() {
  const rand = Math.random().toString(36).slice(2, 8);
  return `job-${Date.now().toString(36)}-${rand}`;
}

async function ensurePrivateDir(path) {
  await mkdir(path, { recursive: true, mode: 0o700 });
  await chmod(path, 0o700);
}

async function writePrivateFile(path, data = "") {
  await ensurePrivateDir(dirname(path));
  await writeFile(path, data, { encoding: "utf8", mode: 0o600 });
  await chmod(path, 0o600);
}

async function appendJsonl(path, obj) {
  await ensurePrivateDir(dirname(path));
  await appendFile(path, `${JSON.stringify(obj)}\n`, { encoding: "utf8", mode: 0o600 });
  await chmod(path, 0o600);
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
    await ensurePrivateDir(this.logsDir);
    if (existsSync(this.jobsPath)) {
      await chmod(this.jobsPath, 0o600);
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
        await this.update(job.id, {
          status: "failed",
          phase: "orphaned",
          endedAt: nowIso(),
          errorKind: "other",
          errorMessage: "Job was active during MCP server restart; no live supervised child process was available, so the job was marked orphaned without signalling any stored pid.",
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
    await writePrivateFile(paths.out);
    await writePrivateFile(paths.err);
    await writePrivateFile(paths.events);
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

  latestTerminal() {
    return [...this.jobs.values()]
      .filter((job) => TERMINAL_STATES.has(job.status))
      .sort((a, b) => String(b.endedAt || b.updatedAt || b.createdAt).localeCompare(String(a.endedAt || a.updatedAt || a.createdAt)))[0] || null;
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
    await appendFile(job.logs.out, text, { encoding: "utf8", mode: 0o600 });
    await chmod(job.logs.out, 0o600);
  }

  async appendErr(job, text) {
    await appendFile(job.logs.err, text, { encoding: "utf8", mode: 0o600 });
    await chmod(job.logs.err, 0o600);
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
  return defaultLogsPath();
}
