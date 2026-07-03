import { spawn } from "node:child_process";
import { execFile } from "node:child_process";
import readline from "node:readline";
import { promisify } from "node:util";
import { localConfigPath, readLocalConfig, resolveCodexBinary } from "./codex-discovery.mjs";
import { mapAndValidateCwd } from "./path-map.mjs";
import { buildCodexChildEnv } from "./child-env.mjs";

const execFileAsync = promisify(execFile);

const FULL_LOCAL_ACCESS_SANDBOX = "danger-full-access";

const SANDBOX_BY_PROFILE = {
  "read-only": "read-only",
  "workspace-write": "workspace-write",
  "full-local-access": FULL_LOCAL_ACCESS_SANDBOX
};

const WAIT_CAP_SECONDS = 60;
const REVIEW_SCOPES = new Set(["auto", "working-tree", "branch"]);

export const REVIEW_ENGINE = {
  path: "codex exec review",
  reason: "`codex exec review --help` is available locally and supports --json, --base, --commit, and --model. The bridge uses it for standard review when no focus text is supplied; focused standard review and critical review use a structured prompt via codex exec --json so focus text is preserved."
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function classifyError(message = "") {
  const text = String(message).toLowerCase();
  if (/\b(rate|quota|usage|limit|too many requests|429)\b/.test(text)) return "usage-limit";
  if (/\b(auth|login|credential|unauthori[sz]ed|forbidden|401|403)\b|api[\s_-]*key/.test(text)) return "auth";
  return "other";
}

function profileToSandbox(profile) {
  const sandbox = SANDBOX_BY_PROFILE[profile];
  if (!sandbox) {
    throw new Error(`Unsupported profile "${profile}". Use read-only, workspace-write, or explicit full-local-access.`);
  }
  return sandbox;
}

function buildReviewPrompt({ mode, focus, base, commit, targetLabel }) {
  const lines = [
    mode === "critical"
      ? "Run a critical code review. Check implementation and design assumptions, look for hidden failure modes, and do not apply patches."
      : "Run a code review. Focus on correctness, regressions, missing tests, and operational risks. Do not apply patches.",
    targetLabel ? `Review target: ${targetLabel}` : null,
    base ? `Base branch/reference: ${base}` : null,
    commit ? `Commit: ${commit}` : null,
    focus ? `User focus: ${focus}` : null,
    "Return findings clearly and include file paths where relevant."
  ].filter(Boolean);
  return lines.join("\n");
}

async function git(cwd, args) {
  try {
    const { stdout } = await execFileAsync("git", args, {
      cwd,
      timeout: 10000,
      maxBuffer: 1024 * 1024
    });
    return { ok: true, stdout: stdout.trim() };
  } catch (error) {
    return {
      ok: false,
      stdout: String(error.stdout ?? "").trim(),
      stderr: String(error.stderr ?? error.message ?? "").trim()
    };
  }
}

async function gitRefExists(cwd, ref) {
  const result = await git(cwd, ["show-ref", "--verify", "--quiet", ref]);
  return result.ok;
}

async function ensureGitRepository(cwd) {
  const result = await git(cwd, ["rev-parse", "--is-inside-work-tree"]);
  if (!result.ok || result.stdout !== "true") {
    throw new Error("Review jobs require cwd to be inside a git working tree.");
  }
}

async function detectDefaultBranch(cwd) {
  for (const name of ["main", "master", "trunk"]) {
    if (await gitRefExists(cwd, `refs/heads/${name}`)) return name;
    if (await gitRefExists(cwd, `refs/remotes/origin/${name}`)) return `origin/${name}`;
  }
  throw new Error("Unable to detect the repository default branch. Pass base or use scope:\"working-tree\".");
}

async function workingTreeIsDirty(cwd) {
  const checks = [
    ["diff", "--cached", "--name-only"],
    ["diff", "--name-only"],
    ["ls-files", "--others", "--exclude-standard"]
  ];
  for (const args of checks) {
    const result = await git(cwd, args);
    if (!result.ok) throw new Error(result.stderr || "Unable to inspect git working tree.");
    if (result.stdout) return true;
  }
  return false;
}

export async function resolveReviewSelection(cwd, options = {}) {
  await ensureGitRepository(cwd);

  if (options.base && options.commit) {
    throw new Error("Review jobs accept either base or commit, not both.");
  }
  if (options.commit) {
    return { commit: options.commit, label: `commit ${options.commit}` };
  }
  if (options.base) {
    return { base: options.base, label: `branch diff against ${options.base}` };
  }

  const scope = options.scope || "auto";
  if (!REVIEW_SCOPES.has(scope)) {
    throw new Error(`Unsupported review scope "${scope}". Use one of: auto, working-tree, branch.`);
  }
  if (scope === "working-tree") {
    return { uncommitted: true, label: "working tree diff" };
  }
  if (scope === "branch") {
    const base = await detectDefaultBranch(cwd);
    return { base, label: `branch diff against ${base}` };
  }
  if (await workingTreeIsDirty(cwd)) {
    return { uncommitted: true, label: "working tree diff" };
  }
  const base = await detectDefaultBranch(cwd);
  return { base, label: `branch diff against ${base}` };
}

export function codexArgsForJob(job, options) {
  const args = ["exec"];
  const isReviewSubcommand = options.reviewSubcommand;
  const isResume = Boolean(options.resumeThreadId);
  if (isReviewSubcommand) {
    args.push("review");
  } else if (isResume) {
    args.push("resume");
  }

  args.push("--json");
  if (!isReviewSubcommand) {
    args.push("--skip-git-repo-check");
  }

  if (isResume) {
    args.push("-c", `sandbox_mode="${job.sandbox}"`);
  } else if (!isReviewSubcommand) {
    args.push("--sandbox", job.sandbox);
    args.push("--cd", job.cwd);
  } else {
    args.push("-c", 'sandbox_mode="read-only"');
  }

  if (job.model) args.push("--model", job.model);
  if (job.effort) args.push("-c", `model_reasoning_effort="${job.effort}"`);

  if (isReviewSubcommand) {
    if (options.base) args.push("--base", options.base);
    if (options.commit) args.push("--commit", options.commit);
    if (options.uncommitted) args.push("--uncommitted");
  }

  if (isResume) {
    args.push(options.resumeThreadId);
  }

  if (!isReviewSubcommand || options.prompt) {
    // Codex parses dash-leading positional text as flags unless separated. The
    // "--" separator keeps caller text as prompt text instead of CLI options.
    args.push("--", options.prompt || "");
  }
  return args;
}

export function redactCodexArgs(args) {
  const redacted = [...args];
  const separator = redacted.lastIndexOf("--");
  if (separator !== -1 && separator < redacted.length - 1) {
    const prompt = String(redacted[separator + 1] || "");
    redacted.splice(separator + 1, redacted.length - separator - 1, `<prompt omitted: ${prompt.length} chars>`);
  }
  return redacted;
}

function updateRecent(job, item) {
  const recent = [...(job.recentItems || []), item].slice(-10);
  return recent;
}

function parseEventForPatch(job, event) {
  const patch = {};
  if (event.type === "thread.started") {
    patch.threadId = event.thread_id || job.threadId;
    patch.phase = "thread.started";
  } else if (event.type === "turn.started") {
    patch.phase = "turn.started";
  } else if (event.type === "item.completed") {
    const item = event.item || {};
    patch.phase = `item.${item.type || "unknown"}`;
    patch.recentItems = updateRecent(job, {
      type: item.type || "unknown",
      text: item.text || item.message || item.summary || "",
      at: new Date().toISOString()
    });
    if (item.type === "agent_message" && typeof item.text === "string") {
      patch.finalMessage = item.text;
    }
  } else if (event.type === "turn.completed") {
    patch.status = "completed";
    patch.phase = "completed";
    patch.endedAt = new Date().toISOString();
    patch.usage = event.usage || null;
    patch.errorKind = null;
    patch.errorMessage = null;
  } else if (event.type === "turn.failed") {
    const msg = event.error?.message || "Codex turn failed.";
    patch.status = "failed";
    patch.phase = "failed";
    patch.endedAt = new Date().toISOString();
    patch.errorKind = classifyError(msg);
    patch.errorMessage = msg;
  } else if (event.type === "error") {
    patch.phase = "warning";
    patch.recentItems = updateRecent(job, {
      type: "error",
      text: event.message || "",
      at: new Date().toISOString()
    });
  } else {
    patch.phase = event.type || "event";
    patch.recentItems = updateRecent(job, {
      type: event.type || "unknown",
      text: "",
      at: new Date().toISOString()
    });
  }
  return patch;
}

export async function createRunnerContext(rootDir, jobStore, env = process.env) {
  return { rootDir, jobStore, env };
}

export async function prepareJob(ctx, input) {
  const localConfig = await readLocalConfig(localConfigPath(ctx.env));
  const cwdInfo = await mapAndValidateCwd(input.cwd, localConfig);
  const profile = input.forceReadOnly ? "read-only" : (input.profile || localConfig.defaultProfile || "workspace-write");
  const sandbox = input.forceReadOnly ? "read-only" : profileToSandbox(profile);
  const codexResolution = await resolveCodexBinary(ctx.env, localConfig);
  if (!codexResolution.path) {
    throw new Error("Codex binary was not found. Run codex_setup for discovery details.");
  }

  let resumeThreadId = null;
  if (input.resume) {
    if (input.resume === "latest") {
      const latest = ctx.jobStore.latestCompletedForWorkspace(cwdInfo.cwd);
      if (!latest?.threadId) {
        throw new Error(`No completed Codex job with a thread id was found for ${cwdInfo.cwd}.`);
      }
      resumeThreadId = latest.threadId;
    } else {
      // Bind an explicit resume id to a thread this bridge created for the SAME
      // workspace, so an injected caller cannot replay another workspace's thread.
      const owned = ctx.jobStore.findByThreadIdForWorkspace(input.resume, cwdInfo.cwd);
      if (!owned) {
        throw new Error(`resume id "${input.resume}" is not a known Codex thread for ${cwdInfo.cwd}. Use resume:"latest" or an id from a prior job in this workspace.`);
      }
      resumeThreadId = input.resume;
    }
  }

  const reviewSelection = input.type === "review"
    ? await resolveReviewSelection(cwdInfo.cwd, { base: input.base, commit: input.commit, scope: input.scope })
    : {};

  const max = localConfig.maxConcurrentJobs || 2;
  const active = ctx.jobStore.activeCount();
  if (active >= max) {
    throw new Error(`Concurrency cap reached: ${active}/${max} jobs are active. Wait for a job to finish or cancel one before starting another.`);
  }
  const job = await ctx.jobStore.create({
    type: input.type,
    cwd: cwdInfo.cwd,
    originalCwd: input.cwd,
    profile,
    sandbox,
    model: input.model,
    effort: input.effort,
    prompt: input.prompt,
    reviewMode: input.reviewMode,
    resumeThreadId,
    threadId: resumeThreadId
  });
  return { job, codexPath: codexResolution.path, localConfig, cwdInfo, resumeThreadId, reviewSelection };
}

export async function startCodexJob(ctx, input) {
  const prepared = await prepareJob(ctx, input);
  const { job, codexPath, resumeThreadId, reviewSelection } = prepared;
  const reviewSubcommand = input.type === "review" && input.reviewMode === "standard" && !input.focus;
  const prompt = input.type === "review"
    ? (reviewSubcommand ? (input.focus || "") : buildReviewPrompt({
      mode: input.reviewMode,
      focus: input.focus,
      base: reviewSelection.base,
      commit: reviewSelection.commit,
      targetLabel: reviewSelection.label
    }))
    : input.prompt;
  const args = codexArgsForJob(job, {
    prompt,
    resumeThreadId,
    reviewSubcommand,
    base: reviewSelection.base,
    commit: reviewSelection.commit,
    uncommitted: reviewSelection.uncommitted
  });

  const pendingIo = new Set();
  const track = (promise) => {
    const tracked = Promise.resolve(promise)
      .catch(async (error) => {
        const current = ctx.jobStore.get(job.id) || job;
        if (!ctx.jobStore.isTerminal(current)) {
          await ctx.jobStore.update(job.id, {
            phase: "log-write-error",
            errorKind: "other",
            errorMessage: error.message
          });
        }
      })
      .finally(() => pendingIo.delete(tracked));
    pendingIo.add(tracked);
    return tracked;
  };

  const currentBeforeStart = ctx.jobStore.get(job.id) || job;
  if (ctx.jobStore.isTerminal(currentBeforeStart)) {
    return currentBeforeStart;
  }

  await ctx.jobStore.update(job.id, {
    status: "running",
    phase: "process.starting",
    startedAt: new Date().toISOString(),
    ownerPid: process.pid,
    command: codexPath,
    argsPreview: redactCodexArgs(args),
    reviewTarget: reviewSelection.label || null
  });

  const currentBeforeSpawn = ctx.jobStore.get(job.id) || job;
  if (ctx.jobStore.isTerminal(currentBeforeSpawn)) {
    return currentBeforeSpawn;
  }

  let proc;
  try {
    proc = spawn(codexPath, args, {
      cwd: job.cwd,
      // Scrub inherited environment before launching Codex.
      env: buildCodexChildEnv(ctx.env),
      detached: true,
      stdio: ["ignore", "pipe", "pipe"]
    });
  } catch (error) {
    await ctx.jobStore.update(job.id, {
      status: "failed",
      phase: "process.spawn-error",
      endedAt: new Date().toISOString(),
      errorKind: classifyError(error.message),
      errorMessage: error.message
    });
    return ctx.jobStore.get(job.id);
  }

  ctx.jobStore.attachProcess(job.id, proc);
  const rl = readline.createInterface({ input: proc.stdout, crlfDelay: Infinity });
  let stdoutQueue = Promise.resolve();
  async function handleStdoutLine(line) {
    const current = ctx.jobStore.get(job.id) || job;
    await ctx.jobStore.appendOut(current, `${line}\n`);
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      if (ctx.jobStore.isTerminal(current)) {
        return;
      }
      await ctx.jobStore.update(job.id, {
        phase: "non-json-output",
        recentItems: updateRecent(current, { type: "stdout", text: line.slice(0, 500), at: new Date().toISOString() })
      });
      return;
    }
    await ctx.jobStore.appendRawEvent(current, event);
    if (ctx.jobStore.isTerminal(current)) {
      return;
    }
    const patch = parseEventForPatch(current, event);
    await ctx.jobStore.update(job.id, patch);
  }

  rl.on("line", (line) => {
    const next = stdoutQueue.then(() => handleStdoutLine(line));
    stdoutQueue = next.catch(() => {});
    track(next);
  });

  proc.stderr.on("data", (chunk) => {
    const text = chunk.toString();
    const current = ctx.jobStore.get(job.id) || job;
    track(ctx.jobStore.appendErr(current, text));
  });

  proc.on("error", (error) => {
    track((async () => {
      ctx.jobStore.detachProcess(job.id);
      await ctx.jobStore.update(job.id, {
        status: "failed",
        phase: "process.spawn-error",
        endedAt: new Date().toISOString(),
        errorKind: classifyError(error.message),
        errorMessage: error.message
      });
    })());
  });

  proc.on("close", async (code, signal) => {
    await Promise.allSettled([...pendingIo]);
    const current = ctx.jobStore.get(job.id) || job;
    ctx.jobStore.detachProcess(job.id);
    if (current.status === "cancelled") {
      await ctx.jobStore.update(job.id, { exitCode: code, signal, endedAt: current.endedAt || new Date().toISOString() });
      return;
    }
    if (current.status === "completed" && code !== 0) {
      const msg = `Codex emitted turn.completed but process exited with code ${code}${signal ? ` signal ${signal}` : ""}.`;
      await ctx.jobStore.update(job.id, {
        status: "failed",
        phase: "process.exited",
        endedAt: new Date().toISOString(),
        exitCode: code,
        signal,
        errorKind: classifyError(msg),
        errorMessage: msg
      });
    } else if (current.status !== "completed" && current.status !== "failed") {
      const msg = code === 0 ? "Codex process exited without turn.completed." : `Codex process exited with code ${code}${signal ? ` signal ${signal}` : ""}.`;
      await ctx.jobStore.update(job.id, {
        status: "failed",
        phase: "process.exited",
        endedAt: new Date().toISOString(),
        exitCode: code,
        signal,
        errorKind: classifyError(msg),
        errorMessage: msg
      });
    } else {
      await ctx.jobStore.update(job.id, { exitCode: code, signal });
    }
  });

  const currentAfterSpawn = ctx.jobStore.get(job.id) || job;
  if (!ctx.jobStore.isTerminal(currentAfterSpawn)) {
    await ctx.jobStore.update(job.id, {
      phase: "process.started",
      pid: proc.pid
    });
  } else if (proc.pid) {
    await ctx.jobStore.update(job.id, { pid: proc.pid });
  }

  return ctx.jobStore.get(job.id);
}

export async function waitForJob(jobStore, id, waitSeconds = 0) {
  const capped = Math.max(0, Math.min(Number(waitSeconds || 0), WAIT_CAP_SECONDS));
  const deadline = Date.now() + capped * 1000;
  let job = jobStore.get(id);
  while (job && !jobStore.isTerminal(job) && Date.now() < deadline) {
    await sleep(500);
    job = jobStore.get(id);
  }
  return job;
}

export async function cancelJob(jobStore, id) {
  const job = jobStore.get(id);
  if (!job) throw new Error(`Unknown job id: ${id}`);
  const proc = jobStore.getProcess(id);
  if (jobStore.isTerminal(job)) {
    return job;
  }
  if (!proc) {
    return jobStore.update(id, {
      status: "cancelled",
      phase: "cancelled.no-live-handle",
      endedAt: new Date().toISOString(),
      errorKind: null,
      errorMessage: job.pid
        ? "No live process handle was available; the stored child pid was not signalled."
        : "Job was not running when cancel was requested."
    });
  }
  let exited = false;
  proc.once("close", () => {
    exited = true;
  });
  killProcessGroup(proc, "SIGTERM");
  setTimeout(() => {
    if (!exited) killProcessGroup(proc, "SIGKILL");
  }, 2000).unref();
  return jobStore.update(id, {
    status: "cancelled",
    phase: "cancelled",
    endedAt: new Date().toISOString(),
    errorKind: null,
    errorMessage: null
  });
}

function killProcessGroup(proc, signal) {
  if (!proc?.pid) return false;
  return killPid(proc.pid, signal);
}

function killPid(pid, signal) {
  if (!pid) return false;
  try {
    process.kill(-pid, signal);
    return true;
  } catch {
    try {
      process.kill(pid, signal);
      return true;
    } catch {
      // The process may already have exited between status check and signal.
      return false;
    }
  }
}
