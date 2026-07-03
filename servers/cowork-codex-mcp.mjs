#!/usr/bin/env node
import readline from "node:readline";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { collectCodexSetup } from "../src/codex-discovery.mjs";
import { JobStore } from "../src/job-store.mjs";
import { cancelActiveJobs, cancelJob, createRunnerContext, REVIEW_ENGINE, startCodexJob, waitForJob } from "../src/codex-runner.mjs";

const SERVER_INFO = {
  name: "cowork-codex",
  version: "0.1.1"
};
const PROTOCOL_VERSION = "2025-06-18";

const here = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(here, "..");
const jobStore = new JobStore(rootDir, { logsDir: process.env.COWORK_CODEX_LOG_DIR });
await jobStore.init();

const commonWait = {
  wait_seconds: {
    type: "number",
    description: "Optional bounded wait before returning. Capped at 60 seconds."
  }
};

const EFFORT_VALUES = ["none", "minimal", "low", "medium", "high", "xhigh"];
const REVIEW_SCOPE_VALUES = ["auto", "working-tree", "branch"];
const PROFILE_VALUES = ["read-only", "workspace-write", "full-local-access"];
const SAFE_MODEL = /^[A-Za-z0-9._:-]+$/;
const SAFE_REF = /^[A-Za-z0-9._/-]+$/;
const SAFE_RESUME = /^[A-Za-z0-9-]+$/;

const TOOLS = [
  {
    name: "codex_setup",
    description: "Report host execution proof, Codex CLI discovery/auth/version state, Node version, local config summary, and active job count.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false }
  },
  {
    name: "codex_start_task",
    description: "Start a Codex task using codex exec --json.",
    inputSchema: {
      type: "object",
      required: ["prompt", "cwd"],
      properties: {
        prompt: { type: "string", minLength: 1 },
        cwd: { type: "string", minLength: 1 },
        profile: { type: "string", enum: PROFILE_VALUES, description: "Permission profile. full-local-access is never a default; use it only when the user explicitly asks for that job." },
        model: { type: "string", description: "Optional Codex model id. Must match ^[A-Za-z0-9._:-]+$." },
        effort: { type: "string", enum: EFFORT_VALUES },
        resume: { type: "string", description: "Use 'latest' for the latest completed thread in this workspace, or pass an explicit thread id matching ^[A-Za-z0-9-]+$." },
        ...commonWait
      },
      additionalProperties: false
    }
  },
  {
    name: "codex_start_review",
    description: "Start a read-only Codex review. Standard mode uses codex exec review; critical mode uses a structured review prompt.",
    inputSchema: {
      type: "object",
      required: ["cwd"],
      properties: {
        cwd: { type: "string", minLength: 1 },
        mode: { type: "string", enum: ["standard", "critical"] },
        base: { type: "string", description: "Optional base ref. Must match ^[A-Za-z0-9._/-]+$." },
        commit: { type: "string", description: "Optional commit/ref. Must match ^[A-Za-z0-9._/-]+$." },
        scope: { type: "string", enum: REVIEW_SCOPE_VALUES, description: "Review target selection when base/commit are omitted." },
        focus: { type: "string", minLength: 1 },
        model: { type: "string", description: "Optional Codex model id. Must match ^[A-Za-z0-9._:-]+$." },
        effort: { type: "string", enum: EFFORT_VALUES },
        ...commonWait
      },
      additionalProperties: false
    }
  },
  {
    name: "codex_job_status",
    description: "Return one job status, or active plus recent jobs when id is omitted.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", minLength: 1 },
        ...commonWait
      },
      additionalProperties: false
    }
  },
  {
    name: "codex_job_result",
    description: "Return the final agent message verbatim with log paths, thread id, and usage.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string", minLength: 1 }
      },
      additionalProperties: false
    }
  },
  {
    name: "codex_cancel_job",
    description: "Cancel a running job with SIGTERM and SIGKILL escalation.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string", minLength: 1 }
      },
      additionalProperties: false
    }
  }
];

function log(...args) {
  console.error("[cowork-codex-mcp]", ...args);
}

let writeQueue = Promise.resolve();
function send(message) {
  const line = `${JSON.stringify(message)}\n`;
  writeQueue = writeQueue
    .catch(() => {})
    .then(() => new Promise((resolveWrite) => {
      process.stdout.write(line, () => resolveWrite());
    }));
}

function result(id, value) {
  send({ jsonrpc: "2.0", id, result: value });
}

function error(id, code, message, data) {
  const response = { jsonrpc: "2.0", id: id ?? null, error: { code, message } };
  if (data !== undefined) response.error.data = data;
  send(response);
}

function toolResult(data) {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    structuredContent: data
  };
}

function toolErrorResult(toolName, errorValue) {
  const message = errorValue?.message || String(errorValue);
  const data = { error: { tool: toolName, message } };
  return {
    isError: true,
    content: [{ type: "text", text: `${toolName} failed: ${message}` }],
    structuredContent: data
  };
}

function validateNoShellMeta(field, value) {
  if (value.startsWith("-")) return `${field} must not start with '-'`;
  if (/[\s"']/.test(value)) return `${field} must not contain whitespace or quotes`;
  return null;
}

function validatePatternField(field, value) {
  if (!["effort", "model", "base", "commit", "resume", "scope"].includes(field)) {
    return null;
  }
  const metaError = validateNoShellMeta(field, value);
  if (metaError) return metaError;
  if (field === "effort" && !EFFORT_VALUES.includes(value)) {
    return "effort must be one of none, minimal, low, medium, high, xhigh";
  }
  if (field === "scope" && !REVIEW_SCOPE_VALUES.includes(value)) {
    return "scope must be one of auto, working-tree, branch";
  }
  if (field === "model" && !SAFE_MODEL.test(value)) {
    return "model must match ^[A-Za-z0-9._:-]+$";
  }
  if ((field === "base" || field === "commit") && !SAFE_REF.test(value)) {
    return `${field} must match ^[A-Za-z0-9._/-]+$`;
  }
  if (field === "resume" && value !== "latest" && !SAFE_RESUME.test(value)) {
    return "resume must be 'latest' or match ^[A-Za-z0-9-]+$";
  }
  return null;
}

function validateToolArguments(tool, args) {
  if (!args || typeof args !== "object" || Array.isArray(args)) {
    return `${tool.name} arguments must be an object`;
  }

  const schema = tool.inputSchema || {};
  const properties = schema.properties || {};
  for (const field of schema.required || []) {
    if (!(field in args)) return `Missing required field: ${field}`;
  }
  if (schema.additionalProperties === false) {
    for (const field of Object.keys(args)) {
      if (!(field in properties)) return `Unknown field: ${field}`;
    }
  }

  for (const [field, value] of Object.entries(args)) {
    const spec = properties[field];
    if (!spec || value === undefined) continue;
    if (spec.type === "string" && typeof value !== "string") {
      return `${field} must be a string`;
    }
    if (spec.type === "string" && spec.minLength && value.length < spec.minLength) {
      return `${field} must be at least ${spec.minLength} character${spec.minLength === 1 ? "" : "s"}`;
    }
    if (spec.type === "number" && typeof value !== "number") {
      return `${field} must be a number`;
    }
    if (spec.type === "number" && !Number.isFinite(value)) {
      return `${field} must be finite`;
    }
    if (spec.enum && !spec.enum.includes(value)) {
      return `${field} must be one of ${spec.enum.join(", ")}`;
    }
    if (typeof value === "string") {
      const patternError = validatePatternField(field, value);
      if (patternError) return patternError;
    }
  }
  if (tool.name === "codex_start_review" && args.base && args.commit) {
    return "Use either base or commit, not both.";
  }
  if (tool.name === "codex_job_status" && !args.id && "wait_seconds" in args) {
    return "wait_seconds requires id for codex_job_status.";
  }
  return null;
}

async function runnerContext() {
  return createRunnerContext(rootDir, jobStore, process.env);
}

async function setupTool() {
  const setup = await collectCodexSetup(process.env);
  setup.jobs = {
    activeCount: jobStore.activeCount(),
    active: jobStore.activeJobs().map((job) => jobStore.summarize(job))
  };
  return setup;
}

function paramsOf(params) {
  return params?.arguments || {};
}

function statusBody(job) {
  return job ? jobStore.summarize(job) : null;
}

async function callTool(name, args) {
  switch (name) {
    case "codex_setup":
      return setupTool();
    case "codex_start_task": {
      const ctx = await runnerContext();
      const job = await startCodexJob(ctx, {
        type: "task",
        prompt: args.prompt,
        cwd: args.cwd,
        profile: args.profile,
        model: args.model,
        effort: args.effort,
        resume: args.resume
      });
      const waited = await waitForJob(jobStore, job.id, args.wait_seconds);
      return { job: statusBody(waited || job), handle: { id: job.id }, reviewEngine: null };
    }
    case "codex_start_review": {
      const mode = args.mode || "standard";
      const ctx = await runnerContext();
      const job = await startCodexJob(ctx, {
        type: "review",
        cwd: args.cwd,
        profile: "read-only",
        forceReadOnly: true,
        reviewMode: mode,
        base: args.base,
        commit: args.commit,
        scope: args.scope,
        focus: args.focus,
        model: args.model,
        effort: args.effort
      });
      const waited = await waitForJob(jobStore, job.id, args.wait_seconds);
      return { job: statusBody(waited || job), handle: { id: job.id }, reviewEngine: REVIEW_ENGINE };
    }
    case "codex_job_status": {
      if (args.id) {
        const waited = await waitForJob(jobStore, args.id, args.wait_seconds);
        if (!waited) throw new Error(`Unknown job id: ${args.id}`);
        return { job: statusBody(waited) };
      }
      return {
        activeCount: jobStore.activeCount(),
        active: jobStore.activeJobs().map((job) => jobStore.summarize(job)),
        recent: jobStore.listRecent(10).map((job) => jobStore.summarize(job))
      };
    }
    case "codex_job_result": {
      const job = jobStore.get(args.id);
      if (!job) throw new Error(`Unknown job id: ${args.id}`);
      return {
        id: job.id,
        status: job.status,
        phase: job.phase,
        finalMessage: job.finalMessage || "",
        logs: job.logs,
        threadId: job.threadId,
        usage: job.usage,
        errorKind: job.errorKind,
        errorMessage: job.errorMessage
      };
    }
    case "codex_cancel_job": {
      const job = await cancelJob(jobStore, args.id);
      return { job: statusBody(job) };
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

async function handleRequest(message) {
  const { id, method, params } = message;

  if (method === "notifications/initialized") {
    log("client initialized");
    return;
  }

  if (id === undefined || id === null) return;

  switch (method) {
    case "initialize":
      result(id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO
      });
      break;
    case "ping":
      result(id, {});
      break;
    case "tools/list":
      result(id, { tools: TOOLS });
      break;
    case "tools/call": {
      const name = params?.name;
      const tool = TOOLS.find((candidate) => candidate.name === name);
      if (!tool) {
        error(id, -32602, `Unknown tool: ${name ?? "<missing>"}`);
        break;
      }
      const args = paramsOf(params);
      const validationError = validateToolArguments(tool, args);
      if (validationError) {
        error(id, -32602, validationError);
        break;
      }
      try {
        const value = await callTool(name, args);
        result(id, toolResult(value));
      } catch (toolError) {
        result(id, toolErrorResult(name, toolError));
      }
      break;
    }
    default:
      error(id, -32601, `Method not found: ${method}`);
  }
}

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
let shuttingDown = false;

async function shutdown(reason, exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  const hardExit = setTimeout(() => process.exit(exitCode), 3000);
  hardExit.unref();
  let finalExitCode = exitCode;
  try {
    const cancelled = await cancelActiveJobs(jobStore, reason);
    if (cancelled.length) log(`cancelled ${cancelled.length} active job(s) during shutdown`);
    await writeQueue.catch(() => {});
  } catch (shutdownError) {
    log("shutdown error", shutdownError);
    finalExitCode = exitCode || 1;
    process.exitCode = finalExitCode;
  } finally {
    process.exit(finalExitCode);
  }
}

rl.on("line", async (line) => {
  if (!line.trim()) return;
  let message;
  try {
    message = JSON.parse(line);
  } catch (parseError) {
    error(null, -32700, "Parse error", parseError.message);
    return;
  }
  if (message?.jsonrpc !== "2.0" || typeof message.method !== "string") {
    error(message?.id ?? null, -32600, "Invalid Request");
    return;
  }
  try {
    await handleRequest(message);
  } catch (requestError) {
    log("unhandled request error", requestError);
    error(message.id ?? null, -32603, "Internal error", requestError.message);
  }
});

rl.on("close", () => {
  void shutdown("MCP stdio closed", 0);
});
process.on("SIGTERM", () => {
  void shutdown("MCP server received SIGTERM", 143);
});
process.on("SIGINT", () => {
  void shutdown("MCP server received SIGINT", 130);
});
process.on("uncaughtException", (err) => {
  log("uncaught exception", err);
  void shutdown("MCP server hit an uncaught exception", 1);
});
process.on("unhandledRejection", (err) => {
  log("unhandled rejection", err);
  void shutdown("MCP server hit an unhandled rejection", 1);
});
