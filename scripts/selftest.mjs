#!/usr/bin/env node
import { chmod, mkdir, mkdtemp, readFile, realpath, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { execFile, spawn } from "node:child_process";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { promisify } from "node:util";
import { buildCodexChildEnv, buildCodexChildPath } from "../src/child-env.mjs";
import { collectCodexSetup, firstExecutablePathLine, readLocalConfig } from "../src/codex-discovery.mjs";
import { cancelActiveJobs, cancelJob, classifyError, codexArgsForJob, redactCodexArgs, resolveReviewSelection, startCodexJob, waitForJob } from "../src/codex-runner.mjs";
import { defaultLogsDir, JobStore } from "../src/job-store.mjs";
import { mapAndValidateCwd } from "../src/path-map.mjs";
import { defaultConfigPath, defaultLogsPath, pathDelimiter } from "../src/platform.mjs";
import { buildCommandInvocation } from "../src/command-invocation.mjs";

const execFileAsync = promisify(execFile);

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const serverPath = resolve(root, "servers/cowork-codex-mcp.mjs");
const packagePath = resolve(root, "package.json");
const pluginManifestPath = resolve(root, ".claude-plugin", "plugin.json");

const tempRoot = await mkdtemp(join(tmpdir(), "cowork-codex-selftest-"));
const tempWorkspace = join(tempRoot, "workspace");
const tempReviewWorkspace = join(tempWorkspace, "live-review-repo");
const tempConfig = join(tempRoot, "cowork-codex.local.json");
const tempCodexHome = join(tempRoot, "codex-home");
const tempServerLogs = join(tempRoot, "server-logs");
await writeFile(join(tempRoot, ".keep"), "", "utf8");
await writeFile(tempConfig, JSON.stringify({
  defaultProfile: "workspace-write",
  cwdAllowlist: [tempWorkspace],
  maxConcurrentJobs: 2
}, null, 2));
await mkdir(tempWorkspace, { recursive: true });
await mkdir(tempCodexHome, { recursive: true });

const child = spawn(process.execPath, [serverPath], {
  cwd: root,
  env: {
    ...process.env,
    COWORK_CODEX_LOCAL_CONFIG: tempConfig,
    COWORK_CODEX_LOG_DIR: tempServerLogs,
    // Temp CODEX_HOME is opt-in: the live job needs the user's real
    // ~/.codex auth, but sandboxed runs cannot write ~/.codex.
    ...(process.env.SELFTEST_TEMP_CODEX_HOME === "1" ? { CODEX_HOME: tempCodexHome } : {})
  },
  stdio: ["pipe", "pipe", "pipe"]
});

const rl = readline.createInterface({ input: child.stdout, crlfDelay: Infinity });
const pending = new Map();
let nextId = 1;
let stderr = "";
const checks = [];

child.stderr.on("data", (chunk) => {
  stderr += chunk.toString();
});

rl.on("line", (line) => {
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    console.log(`NON_JSON_STDOUT ${line}`);
    return;
  }
  const waiter = pending.get(message.id);
  if (waiter) {
    pending.delete(message.id);
    waiter.resolve(message);
  }
});

function pass(name, detail = "") {
  checks.push({ name, ok: true, detail });
  console.log(`PASS ${name}${detail ? ` - ${detail}` : ""}`);
}

function fail(name, detail) {
  checks.push({ name, ok: false, detail });
  console.log(`FAIL ${name} - ${detail}`);
}

function send(method, params = {}, timeoutMs = 120000) {
  const id = nextId++;
  child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
  return new Promise((resolvePromise, rejectPromise) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      rejectPromise(new Error(`Timed out waiting for ${method}`));
    }, timeoutMs);
    pending.set(id, {
      resolve: (message) => {
        clearTimeout(timer);
        resolvePromise(message);
      }
    });
  });
}

function notify(method, params = {}) {
  child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method, params })}\n`);
}

function data(response) {
  return response.result?.structuredContent;
}

async function callTool(name, args = {}, timeoutMs) {
  const response = await send("tools/call", { name, arguments: args }, timeoutMs);
  return response;
}

async function waitForToolJobComplete(id, totalSeconds = 240) {
  const deadline = Date.now() + totalSeconds * 1000;
  let job = null;
  while (Date.now() < deadline) {
    const remainingSeconds = Math.max(1, Math.ceil((deadline - Date.now()) / 1000));
    const waitSeconds = Math.min(60, remainingSeconds);
    const response = await callTool("codex_job_status", { id, wait_seconds: waitSeconds }, (waitSeconds + 30) * 1000);
    if (response.result?.isError) {
      throw new Error(response.result.structuredContent?.error?.message || "codex_job_status failed");
    }
    job = data(response).job;
    if (["completed", "failed", "cancelled", "rejected"].includes(job?.status)) return job;
  }
  return job;
}

async function git(args, cwd = tempWorkspace) {
  const { stdout } = await execFileAsync("git", args, {
    cwd,
    timeout: 10000,
    maxBuffer: 1024 * 1024
  });
  return stdout.trim();
}

async function prepareReviewFixture() {
  await mkdir(tempReviewWorkspace, { recursive: true });
  await git(["init", "-b", "main"], tempReviewWorkspace);
  await git(["config", "user.name", "Cowork Codex Selftest"], tempReviewWorkspace);
  await git(["config", "user.email", "cowork-codex-selftest@example.invalid"], tempReviewWorkspace);
  await writeFile(join(tempReviewWorkspace, "review-target.js"), "export function add(a, b) {\n  return a + b;\n}\n", "utf8");
  await git(["add", "review-target.js"], tempReviewWorkspace);
  await git(["commit", "-m", "initial review fixture"], tempReviewWorkspace);
  await writeFile(join(tempReviewWorkspace, "review-target.js"), "export function add(a, b) {\n  return a - b;\n}\n", "utf8");
}

async function expect(name, fn) {
  try {
    const detail = await fn();
    pass(name, detail);
  } catch (error) {
    fail(name, error.message);
    throw error;
  }
}

async function modeOf(path) {
  return (await stat(path)).mode & 0o777;
}

let exitCode = 0;

try {
  await expect("local config clamps unsupported defaults", async () => {
    const badConfig = join(tempRoot, "bad-config.json");
    await writeFile(badConfig, JSON.stringify({
      defaultProfile: "full-local-access",
      cwdAllowlist: tempWorkspace,
      codexBin: 123,
      maxConcurrentJobs: "abc"
    }), "utf8");
    const config = await readLocalConfig(badConfig);
    if (config.defaultProfile !== "workspace-write") throw new Error(`defaultProfile was ${config.defaultProfile}`);
    if (config.maxConcurrentJobs !== 8) throw new Error(`maxConcurrentJobs was ${config.maxConcurrentJobs}`);
    if (config.cwdAllowlist.length !== 0) throw new Error("non-array cwdAllowlist should be ignored");
    if (config.codexBin !== null) throw new Error("non-string codexBin should be ignored");
    if (!config.warnings?.length) throw new Error("expected config warnings");
    return config.warnings.join(" | ");
  });

  await expect("shell discovery ignores noisy startup output", async () => {
    const fakeCodex = join(tempRoot, "fake-codex-discovery");
    await writeFile(fakeCodex, "#!/bin/sh\nexit 0\n", "utf8");
    await chmod(fakeCodex, 0o755);
    const selected = await firstExecutablePathLine(`Welcome back\n${fakeCodex}\n`);
    if (selected !== fakeCodex) throw new Error(`selected ${selected || "<none>"}`);
    return selected;
  });

  await expect("codex setup treats Not logged in as unauthenticated", async () => {
    const fakeCodex = join(tempRoot, "fake-codex-login-status.mjs");
    await writeFile(fakeCodex, `#!/usr/bin/env node
if (process.argv[2] === "--version") {
  console.log("codex-cli 0.142.5");
  process.exit(0);
}
if (process.argv[2] === "login" && process.argv[3] === "status") {
  console.log("Not logged in");
  process.exit(0);
}
process.exit(1);
`, "utf8");
    await chmod(fakeCodex, 0o755);
    const setup = await collectCodexSetup({
      ...process.env,
      CODEX_BIN: fakeCodex,
      COWORK_CODEX_LOCAL_CONFIG: tempConfig
    });
    if (setup.codex.loginStatus.loggedIn) throw new Error("Not logged in was parsed as logged in");
    if (setup.codex.loginStatus.method !== null) throw new Error(`unexpected method ${setup.codex.loginStatus.method}`);
    return `loggedIn=${setup.codex.loginStatus.loggedIn}`;
  });

  await expect("codex setup probes use limited child env", async () => {
    const fakeCodex = join(tempRoot, "fake-codex-setup-env.mjs");
    await writeFile(fakeCodex, `#!/usr/bin/env node
const forbidden = ["OPENAI_API_KEY", "CODEX_EXTRA", "GITHUB_TOKEN"].filter((name) => process.env[name]);
if (forbidden.length) {
  console.error("forbidden env leaked: " + forbidden.join(","));
  process.exit(3);
}
const pathText = String(process.env.PATH || process.env.Path || "");
if (!pathText.includes(".npm-global") && !pathText.includes("npm")) {
  console.error("child PATH was not augmented");
  process.exit(4);
}
if (process.argv[2] === "--version") {
  console.log("codex-cli 0.142.5");
  process.exit(0);
}
if (process.argv[2] === "login" && process.argv[3] === "status") {
  console.log("Logged in using ChatGPT");
  process.exit(0);
}
process.exit(1);
`, "utf8");
    await chmod(fakeCodex, 0o755);
    const setup = await collectCodexSetup({
      ...process.env,
      PATH: "/usr/bin:/bin",
      CODEX_BIN: fakeCodex,
      COWORK_CODEX_LOCAL_CONFIG: tempConfig,
      OPENAI_API_KEY: "drop-me",
      CODEX_EXTRA: "drop-me",
      GITHUB_TOKEN: "drop-me"
    });
    if (!setup.codex.version.ok) throw new Error(`version failed: ${setup.codex.version.text}`);
    if (!setup.codex.loginStatus.loggedIn) throw new Error("login status did not use fake logged-in output");
    if (setup.childProcess.envPolicy !== "codex setup probes use the same limited child environment as Codex jobs") {
      throw new Error(`unexpected env policy: ${setup.childProcess.envPolicy}`);
    }
    return setup.childProcess.envPolicy;
  });

  await expect("child env drops broad CODEX variables", async () => {
    const codexApiName = ["CODEX", "API", "KEY"].join("_");
    const codexExtraName = ["CODEX", "EXTRA"].join("_");
    const openAiName = ["OPENAI", "API", "KEY"].join("_");
    const githubName = ["GITHUB", "TOKEN"].join("_");
    const sourceEnv = {
      PATH: "/bin",
      HOME: "/home/user",
      CODEX_HOME: "/home/user/.codex",
      LC_ALL: "C"
    };
    sourceEnv[codexApiName] = "drop-me";
    sourceEnv[codexExtraName] = "drop-me";
    sourceEnv[openAiName] = "drop-me";
    sourceEnv[githubName] = "drop-me";
    const env = buildCodexChildEnv(sourceEnv);
    if (env.CODEX_HOME !== "/home/user/.codex") throw new Error("CODEX_HOME should be preserved");
    for (const name of [codexApiName, codexExtraName, openAiName, githubName]) {
      if (name in env) throw new Error(`${name} leaked into child env`);
    }
    if (env.LC_ALL !== "C") throw new Error("LC_* should be preserved");
    if (process.platform === "darwin" && !env.PATH.includes("/opt/homebrew/bin")) {
      throw new Error(`PATH missing Homebrew fallback: ${env.PATH}`);
    }
    if (!env.PATH.includes("/home/user/.npm-global/bin")) throw new Error(`PATH missing npm fallback: ${env.PATH}`);
    return Object.keys(env).sort().join(", ");
  });

  await expect("child PATH augments POSIX launchd-minimal path", async () => {
    const path = buildCodexChildPath({ PATH: "/usr/bin:/bin", HOME: "/Users/example" });
    const entries = path.split(":");
    for (const required of ["/usr/bin", "/bin", "/opt/homebrew/bin", "/usr/local/bin", "/Users/example/.npm-global/bin"]) {
      if (!entries.includes(required)) throw new Error(`missing ${required} in ${path}`);
    }
    if (entries.indexOf("/usr/bin") !== entries.lastIndexOf("/usr/bin")) throw new Error(`duplicate /usr/bin in ${path}`);
    return path;
  });

  await expect("child PATH handles Windows delimiter and npm locations", async () => {
    const env = {
      Path: "C:\\Windows\\System32;C:\\Program Files\\nodejs",
      USERPROFILE: "C:\\Users\\example",
      APPDATA: "C:\\Users\\example\\AppData\\Roaming",
      LOCALAPPDATA: "C:\\Users\\example\\AppData\\Local",
      ProgramFiles: "C:\\Program Files"
    };
    const path = buildCodexChildPath(env, { platform: "win32" });
    const entries = path.split(";");
    for (const required of [
      "C:\\Windows\\System32",
      "C:\\Program Files\\nodejs",
      "C:\\Users\\example\\AppData\\Roaming\\npm",
      "C:\\Users\\example\\AppData\\Local\\npm"
    ]) {
      if (!entries.includes(required)) throw new Error(`missing ${required} in ${path}`);
    }
    if (path.includes(":C:")) throw new Error(`used POSIX delimiter for Windows path: ${path}`);
    return path;
  });

  await expect("platform config and log paths support Windows env", async () => {
    const env = {
      APPDATA: "C:\\Users\\example\\AppData\\Roaming",
      LOCALAPPDATA: "C:\\Users\\example\\AppData\\Local",
      USERPROFILE: "C:\\Users\\example"
    };
    const configPath = defaultConfigPath(env, "win32");
    const logsPath = defaultLogsPath(env, "win32");
    if (!configPath.includes("AppData")) throw new Error(`unexpected config path: ${configPath}`);
    if (!logsPath.includes("Local")) throw new Error(`unexpected logs path: ${logsPath}`);
    if (pathDelimiter("win32") !== ";") throw new Error("Windows delimiter was not semicolon");
    return `${configPath} | ${logsPath}`;
  });

  await expect("classifyError uses word boundaries", async () => {
    if (classifyError("failed to generate a response") !== "other") throw new Error("generate matched rate");
    if (classifyError("author field missing") !== "other") throw new Error("author matched auth");
    if (classifyError("rate limit exceeded") !== "usage-limit") throw new Error("rate limit not classified");
    if (classifyError("API key is missing") !== "auth") throw new Error("api key not classified");
    return "generate/author avoided; rate/api key classified";
  });

  await expect("default logs dir is outside the plugin root", async () => {
    const logsDir = defaultLogsDir(root);
    if (logsDir.startsWith(root)) throw new Error(`logs dir is inside repo: ${logsDir}`);
    if (!logsDir.includes(join("cowork-codex", "logs"))) {
      throw new Error(`unexpected logs dir: ${logsDir}`);
    }
    return logsDir;
  });

  await expect("dash-leading prompt handling (-- before positional)", async () => {
    const flagLikePrompt = "--model";
    const reviewArgs = codexArgsForJob({ sandbox: "read-only", cwd: "/tmp/x" }, { prompt: flagLikePrompt, reviewSubcommand: true });
    const rSep = reviewArgs.lastIndexOf("--");
    if (rSep === -1) throw new Error("no -- separator in review argv");
    if (reviewArgs.includes(flagLikePrompt)) throw new Error(`review prompt leaked into argv: ${reviewArgs.join(" ")}`);
    if (reviewArgs[rSep + 1] !== "-") throw new Error(`review focus not routed through stdin: ${reviewArgs.join(" ")}`);
    const taskArgs = codexArgsForJob({ sandbox: "workspace-write", cwd: "/tmp/x" }, { prompt: flagLikePrompt });
    const tSep = taskArgs.lastIndexOf("--");
    if (taskArgs.includes(flagLikePrompt)) throw new Error(`task prompt leaked into argv: ${taskArgs.join(" ")}`);
    if (taskArgs[tSep + 1] !== "-") throw new Error(`task prompt not routed through stdin: ${taskArgs.join(" ")}`);
    return "focus/prompt routed through stdin";
  });

  await expect("resume argv uses resume-supported flags", async () => {
    const args = codexArgsForJob({ sandbox: "read-only", cwd: "/tmp/x", model: "codex-test-model", effort: "high" }, {
      prompt: "RESUME_PROMPT",
      resumeThreadId: "019f0000-0000-7000-8000-000000000000"
    });
    if (args[0] !== "exec" || args[1] !== "resume") throw new Error(`not a resume argv: ${args.join(" ")}`);
    if (args.includes("--sandbox") || args.includes("--cd")) throw new Error(`resume argv used task-only flags: ${args.join(" ")}`);
    const sessionIndex = args.indexOf("019f0000-0000-7000-8000-000000000000");
    const separatorIndex = args.lastIndexOf("--");
    if (sessionIndex === -1 || separatorIndex <= sessionIndex) throw new Error(`resume prompt separator misplaced: ${args.join(" ")}`);
    if (args[separatorIndex + 1] !== "-") throw new Error(`resume prompt not routed through stdin: ${args.join(" ")}`);
    if (!args.includes("--model") || !args.includes("codex-test-model")) throw new Error(`resume model missing: ${args.join(" ")}`);
    if (!args.includes('model_reasoning_effort="high"')) throw new Error(`resume effort missing: ${args.join(" ")}`);
    return args.join(" ");
  });

  await expect("argv redaction omits prompt text", async () => {
    const marker = "PROMPT_MARKER_SHOULD_NOT_APPEAR";
    const args = codexArgsForJob({ sandbox: "workspace-write", cwd: tempWorkspace }, { prompt: marker });
    const redacted = redactCodexArgs(args, marker);
    if (redacted.join("\n").includes(marker)) throw new Error(`marker leaked in ${JSON.stringify(redacted)}`);
    if (!redacted.some((arg) => arg.includes("stdin prompt omitted"))) throw new Error(`no redaction marker in ${JSON.stringify(redacted)}`);
    return redacted.slice(-2).join(" ");
  });

  await expect("Windows command shims are wrapped through cmd.exe", async () => {
    const invocation = buildCommandInvocation("C:\\Users\\me\\AppData\\Roaming\\npm\\codex.cmd", ["exec", "--json", "--", "-"], {
      platform: "win32",
      env: { ComSpec: "C:\\Windows\\System32\\cmd.exe" }
    });
    if (invocation.command !== "C:\\Windows\\System32\\cmd.exe") throw new Error(`unexpected command ${invocation.command}`);
    if (!invocation.args.includes("/c")) throw new Error(`missing /c: ${invocation.args.join(" ")}`);
    const commandLine = invocation.args.at(-1);
    if (!commandLine.includes("codex.cmd") || !commandLine.includes("--json")) {
      throw new Error(`unexpected cmd line: ${commandLine}`);
    }
    return commandLine;
  });

  await expect("review argv target selection", async () => {
    const baseArgs = codexArgsForJob({ sandbox: "read-only", cwd: "/tmp/x" }, { prompt: "", reviewSubcommand: true, base: "main" });
    if (!baseArgs.includes("--base") || baseArgs.includes("--uncommitted")) throw new Error(`base review argv wrong: ${baseArgs.join(" ")}`);
    if (baseArgs.includes("--skip-git-repo-check")) throw new Error(`review subcommand should not skip git repo check: ${baseArgs.join(" ")}`);
    if (baseArgs.includes("--")) throw new Error(`empty review focus should not add positional separator: ${baseArgs.join(" ")}`);
    const commitArgs = codexArgsForJob({ sandbox: "read-only", cwd: "/tmp/x" }, { prompt: "", reviewSubcommand: true, commit: "abc123" });
    if (!commitArgs.includes("--commit") || commitArgs.includes("--uncommitted")) throw new Error(`commit review argv wrong: ${commitArgs.join(" ")}`);
    const wtArgs = codexArgsForJob({ sandbox: "read-only", cwd: "/tmp/x" }, { prompt: "", reviewSubcommand: true, uncommitted: true });
    if (!wtArgs.includes("--uncommitted")) throw new Error(`working-tree review argv wrong: ${wtArgs.join(" ")}`);
    return "base/commit/working-tree separated";
  });

  await expect("Cowork VM path mapping supports host-absolute, workspace, and relative mounts", async () => {
    const relativeDir = join(tempWorkspace, "relative-child");
    const siblingDir = join(tempRoot, `${basename(tempWorkspace)}-sibling`);
    await mkdir(relativeDir, { recursive: true });
    await mkdir(siblingDir, { recursive: true });
    const tempWorkspaceReal = await realpath(tempWorkspace);
    const relativeDirReal = await realpath(relativeDir);
    const config = { exists: true, path: tempConfig, cwdAllowlist: [tempWorkspace] };
    const hostAbsoluteInput = `/sessions/alice/mnt${tempWorkspace}`;
    const hostMapped = await mapAndValidateCwd(hostAbsoluteInput, config);
    if (hostMapped.cwd !== tempWorkspaceReal) throw new Error(`host absolute mapped to ${hostMapped.cwd}`);
    const workspaceMapped = await mapAndValidateCwd(`/sessions/alice/mnt/${basename(tempWorkspace)}`, config);
    if (workspaceMapped.cwd !== tempWorkspaceReal) throw new Error(`workspace basename mapped to ${workspaceMapped.cwd}`);
    const relativeMapped = await mapAndValidateCwd("/sessions/alice/mnt/relative-child", config);
    if (relativeMapped.cwd !== relativeDirReal) throw new Error(`relative mount mapped to ${relativeMapped.cwd}`);
    const workspaceChildMapped = await mapAndValidateCwd(`/sessions/alice/mnt/${basename(tempWorkspace)}/relative-child`, config);
    if (workspaceChildMapped.cwd !== relativeDirReal) throw new Error(`workspace child mapped to ${workspaceChildMapped.cwd}`);
    let rejected = false;
    try {
      await mapAndValidateCwd(`/sessions/alice/mnt/${basename(siblingDir)}`, config);
    } catch {
      rejected = true;
    }
    if (!rejected) throw new Error("sibling workspace path was accepted");
    return `${hostMapped.cwd} / ${workspaceMapped.cwd} / ${workspaceChildMapped.cwd}`;
  });

  await expect("Cowork VM path mapping rejects ambiguous allowlist matches", async () => {
    const firstApp = join(tempRoot, "path-map-a", "app");
    const secondApp = join(tempRoot, "path-map-b", "app");
    await mkdir(firstApp, { recursive: true });
    await mkdir(secondApp, { recursive: true });
    const duplicateConfig = { exists: true, path: tempConfig, cwdAllowlist: [firstApp, secondApp] };
    let duplicateMessage = "";
    try {
      await mapAndValidateCwd("/sessions/alice/mnt/app", duplicateConfig);
    } catch (error) {
      duplicateMessage = error.message;
    }
    if (!duplicateMessage.includes("multiple allowlisted host folders")) {
      throw new Error(`duplicate basename was not rejected: ${duplicateMessage}`);
    }

    const parent = join(tempRoot, "path-map-parent");
    const parentSrc = join(parent, "src");
    const siblingSrc = join(tempRoot, "src");
    await mkdir(parentSrc, { recursive: true });
    await mkdir(siblingSrc, { recursive: true });
    const relativeConfig = { exists: true, path: tempConfig, cwdAllowlist: [parent, siblingSrc] };
    let relativeMessage = "";
    try {
      await mapAndValidateCwd("/sessions/alice/mnt/src", relativeConfig);
    } catch (error) {
      relativeMessage = error.message;
    }
    if (!relativeMessage.includes("multiple allowlisted host folders")) {
      throw new Error(`relative ambiguity was not rejected: ${relativeMessage}`);
    }

    const hostAbsolute = await mapAndValidateCwd(`/sessions/alice/mnt${secondApp}`, duplicateConfig);
    const secondAppReal = await realpath(secondApp);
    if (hostAbsolute.cwd !== secondAppReal) throw new Error(`host absolute path mapped to ${hostAbsolute.cwd}`);
    return `${duplicateMessage.slice(0, 80)} | ${hostAbsolute.cwd}`;
  });

  await expect("review selection rejects base and commit together", async () => {
    const reviewRepo = join(tempRoot, "review-selection-repo");
    await mkdir(reviewRepo, { recursive: true });
    await execFileAsync("git", ["init", "-b", "main"], { cwd: reviewRepo, timeout: 10000 });
    await execFileAsync("git", ["config", "user.name", "Cowork Codex Selftest"], { cwd: reviewRepo, timeout: 10000 });
    await execFileAsync("git", ["config", "user.email", "cowork-codex-selftest@example.invalid"], { cwd: reviewRepo, timeout: 10000 });
    await writeFile(join(reviewRepo, "file.txt"), "one\n", "utf8");
    await execFileAsync("git", ["add", "file.txt"], { cwd: reviewRepo, timeout: 10000 });
    await execFileAsync("git", ["commit", "-m", "initial"], { cwd: reviewRepo, timeout: 10000 });
    let message = "";
    try {
      await resolveReviewSelection(reviewRepo, { base: "main", commit: "HEAD" });
    } catch (error) {
      message = error.message;
    }
    if (!message.includes("either base or commit")) throw new Error(`unexpected message: ${message}`);
    return message;
  });

  await expect("review pre-spawn failure leaves no active job", async () => {
    const fakeCodex = join(tempRoot, "fake-codex-noop.sh");
    const fakeConfig = join(tempRoot, "fake-review-config.json");
    await writeFile(fakeCodex, "#!/bin/sh\nexit 0\n", "utf8");
    await chmod(fakeCodex, 0o755);
    await writeFile(fakeConfig, JSON.stringify({
      defaultProfile: "workspace-write",
      cwdAllowlist: [tempWorkspace],
      codexBin: fakeCodex,
      maxConcurrentJobs: 2
    }), "utf8");
    const store = new JobStore(tempRoot, { logsDir: join(tempRoot, "review-failure-logs") });
    await store.init();
    let message = "";
    try {
      await startCodexJob({
        jobStore: store,
        env: { ...process.env, CODEX_BIN: fakeCodex, COWORK_CODEX_LOCAL_CONFIG: fakeConfig }
      }, {
        type: "review",
        cwd: tempWorkspace,
        forceReadOnly: true,
        reviewMode: "standard"
      });
    } catch (error) {
      message = error.message;
    }
    if (!message) throw new Error("expected review selection failure");
    if (store.activeCount() !== 0) throw new Error(`active jobs leaked: ${store.activeCount()}`);
    if (store.listRecent(10).length !== 0) throw new Error("job record was created before review selection failed");
    return message.slice(0, 120);
  });

  await expect("orphan sweep clears active jobs without live pid", async () => {
    const store = new JobStore(tempRoot, { logsDir: join(tempRoot, "orphan-logs") });
    await store.init();
    const job = await store.create({
      type: "task",
      cwd: tempWorkspace,
      originalCwd: tempWorkspace,
      profile: "read-only",
      sandbox: "read-only",
      prompt: "ORPHAN_PROMPT_MARKER"
    });
    await store.update(job.id, { status: "running", phase: "process.started", pid: null });
    await store.sweepOrphans();
    const swept = store.get(job.id);
    if (swept.status !== "failed" || swept.phase !== "orphaned") throw new Error(`unexpected orphan status ${swept.status}/${swept.phase}`);
    if (store.activeCount() !== 0) throw new Error(`orphan remained active: ${store.activeCount()}`);
    return swept.errorMessage;
  });

  await expect("orphan sweep and no-handle cancel do not signal stored pids", async () => {
    const originalKill = process.kill;
    const calls = [];
    process.kill = (...args) => {
      calls.push(args);
      throw Object.assign(new Error("mocked process.kill"), { code: "ESRCH" });
    };
    try {
      const store = new JobStore(tempRoot, { logsDir: join(tempRoot, "stored-pid-logs") });
      await store.init();
      const orphan = await store.create({
        type: "task",
        cwd: tempWorkspace,
        originalCwd: tempWorkspace,
        profile: "read-only",
        sandbox: "read-only",
        prompt: "ORPHAN_STORED_PID_PROMPT"
      });
      await store.update(orphan.id, { status: "running", phase: "process.started", pid: 123456 });
      await store.sweepOrphans();
      const swept = store.get(orphan.id);
      if (swept.status !== "failed" || swept.phase !== "orphaned") throw new Error(`unexpected orphan ${swept.status}/${swept.phase}`);

      const cancelTarget = await store.create({
        type: "task",
        cwd: tempWorkspace,
        originalCwd: tempWorkspace,
        profile: "read-only",
        sandbox: "read-only",
        prompt: "CANCEL_STORED_PID_PROMPT"
      });
      await store.update(cancelTarget.id, { status: "running", phase: "process.started", pid: 234567 });
      const cancelled = await cancelJob(store, cancelTarget.id);
      if (cancelled.status !== "cancelled" || cancelled.phase !== "cancelled.no-live-handle") {
        throw new Error(`unexpected cancel ${cancelled.status}/${cancelled.phase}`);
      }
      if (calls.length !== 0) throw new Error(`stored pid was signalled: ${JSON.stringify(calls)}`);
      return "no process.kill calls";
    } finally {
      process.kill = originalKill;
    }
  });

  await expect("job store writes private log files", async () => {
    const oldUmask = process.umask(0o022);
    try {
      const logsDir = join(tempRoot, "file-mode-logs");
      const store = new JobStore(tempRoot, { logsDir });
      await store.init();
      const job = await store.create({
        type: "task",
        cwd: tempWorkspace,
        originalCwd: tempWorkspace,
        profile: "read-only",
        sandbox: "read-only",
        prompt: "FILE_MODE_PROMPT"
      });
      await store.appendOut(job, "out\n");
      await store.appendErr(job, "err\n");
      await store.appendRawEvent(job, { type: "test.event" });
      const expected = [
        [logsDir, 0o700],
        [store.jobsPath, 0o600],
        [job.logs.out, 0o600],
        [job.logs.err, 0o600],
        [job.logs.events, 0o600]
      ];
      for (const [path, mode] of expected) {
        const actual = await modeOf(path);
        if (actual !== mode) throw new Error(`${path} mode ${actual.toString(8)} expected ${mode.toString(8)}`);
      }
      return "logs 0700; files 0600";
    } finally {
      process.umask(oldUmask);
    }
  });

  await expect("orphan sweep does not trust stored live owner pid", async () => {
    const store = new JobStore(tempRoot, { logsDir: join(tempRoot, "live-owner-logs") });
    await store.init();
    const job = await store.create({
      type: "task",
      cwd: tempWorkspace,
      originalCwd: tempWorkspace,
      profile: "read-only",
      sandbox: "read-only",
      prompt: "LIVE_OWNER_PROMPT_MARKER"
    });
    await store.update(job.id, { status: "running", phase: "process.started", ownerPid: process.pid, pid: null });
    await store.sweepOrphans();
    const swept = store.get(job.id);
    if (swept.status !== "failed" || swept.phase !== "orphaned") throw new Error(`live owner pid was accepted as ${swept.status}/${swept.phase}`);
    if (store.activeCount() !== 0) throw new Error(`orphan remained active: ${store.activeCount()}`);
    return `ownerPid ${swept.ownerPid} marked ${swept.phase}`;
  });

  await expect("fake Codex fast close completes and prompt is not logged", async () => {
    const marker = "FULL_PROMPT_MARKER_SHOULD_NOT_BE_LOGGED";
    const fakeCodex = join(tempRoot, "fake-codex-complete.mjs");
    const fakeConfig = join(tempRoot, "fake-complete-config.json");
    await writeFile(fakeCodex, `#!/usr/bin/env node
console.log(JSON.stringify({ type: "thread.started", thread_id: "fake-thread-1" }));
console.log(JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: "FAKE_OK" } }));
console.log(JSON.stringify({ type: "turn.completed", usage: { total_tokens: 1 } }));
`, "utf8");
    await chmod(fakeCodex, 0o755);
    await writeFile(fakeConfig, JSON.stringify({
      defaultProfile: "workspace-write",
      cwdAllowlist: [tempWorkspace],
      codexBin: fakeCodex,
      maxConcurrentJobs: 2
    }), "utf8");
    const store = new JobStore(tempRoot, { logsDir: join(tempRoot, "fake-complete-logs") });
    await store.init();
    const job = await startCodexJob({
      jobStore: store,
      env: { ...process.env, CODEX_BIN: fakeCodex, COWORK_CODEX_LOCAL_CONFIG: fakeConfig }
    }, {
      type: "task",
      prompt: marker,
      cwd: tempWorkspace,
      profile: "read-only"
    });
    const completed = await waitForJob(store, job.id, 10);
    if (completed.status !== "completed") throw new Error(`fake job ended ${completed.status}: ${completed.errorMessage || ""}`);
    if (completed.finalMessage !== "FAKE_OK") throw new Error(`final message was ${completed.finalMessage}`);
    if (completed.errorKind !== null || completed.errorMessage !== null) throw new Error(`completed job kept stale error fields: ${completed.errorKind}/${completed.errorMessage}`);
    const jobsLog = await readFile(store.jobsPath, "utf8");
    if (jobsLog.includes(marker)) throw new Error("full prompt marker leaked into jobs.jsonl");
    if (jobsLog.includes("\"args\"")) throw new Error("raw args were persisted");
    if (!jobsLog.includes("argsPreview")) throw new Error("argsPreview was not persisted");
    return `${completed.id} ${completed.threadId}`;
  });

  await expect("full-local-access profile maps to danger-full-access argv", async () => {
    const fakeCodex = join(tempRoot, "fake-codex-full-local.mjs");
    const fakeConfig = join(tempRoot, "fake-full-local-config.json");
    await writeFile(fakeCodex, `#!/usr/bin/env node
console.log(JSON.stringify({ type: "thread.started", thread_id: "fake-thread-full-local" }));
console.log(JSON.stringify({ type: "turn.completed", usage: { total_tokens: 1 } }));
`, "utf8");
    await chmod(fakeCodex, 0o755);
    await writeFile(fakeConfig, JSON.stringify({
      defaultProfile: "workspace-write",
      cwdAllowlist: [tempWorkspace],
      codexBin: fakeCodex,
      maxConcurrentJobs: 2
    }), "utf8");
    const store = new JobStore(tempRoot, { logsDir: join(tempRoot, "fake-full-local-logs") });
    await store.init();
    const job = await startCodexJob({
      jobStore: store,
      env: { ...process.env, CODEX_BIN: fakeCodex, COWORK_CODEX_LOCAL_CONFIG: fakeConfig }
    }, {
      type: "task",
      prompt: "FULL_LOCAL_PROFILE_PROMPT",
      cwd: tempWorkspace,
      profile: "full-local-access"
    });
    const completed = await waitForJob(store, job.id, 10);
    if (completed.status !== "completed") throw new Error(`full-local fake job ended ${completed.status}`);
    if (completed.sandbox !== "danger-full-access") throw new Error(`sandbox was ${completed.sandbox}`);
    const args = completed.argsPreview || [];
    if (!args.includes("--sandbox") || !args.includes("danger-full-access")) {
      throw new Error(`argsPreview missing danger-full-access: ${JSON.stringify(args)}`);
    }
    return args.join(" ");
  });

  await expect("concurrency cap rejects extra active job", async () => {
    const fakeCodex = join(tempRoot, "fake-codex-slow.mjs");
    const fakeConfig = join(tempRoot, "fake-concurrency-config.json");
    await writeFile(fakeCodex, `#!/usr/bin/env node
setTimeout(() => {
  console.log(JSON.stringify({ type: "thread.started", thread_id: "fake-thread-slow" }));
  console.log(JSON.stringify({ type: "turn.completed", usage: { total_tokens: 1 } }));
}, 1500);
`, "utf8");
    await chmod(fakeCodex, 0o755);
    await writeFile(fakeConfig, JSON.stringify({
      defaultProfile: "workspace-write",
      cwdAllowlist: [tempWorkspace],
      codexBin: fakeCodex,
      maxConcurrentJobs: 1
    }), "utf8");
    const store = new JobStore(tempRoot, { logsDir: join(tempRoot, "fake-concurrency-logs") });
    await store.init();
    const first = await startCodexJob({
      jobStore: store,
      env: { ...process.env, CODEX_BIN: fakeCodex, COWORK_CODEX_LOCAL_CONFIG: fakeConfig }
    }, {
      type: "task",
      prompt: "FIRST_CONCURRENCY_PROMPT",
      cwd: tempWorkspace,
      profile: "read-only"
    });
    let message = "";
    try {
      await startCodexJob({
        jobStore: store,
        env: { ...process.env, CODEX_BIN: fakeCodex, COWORK_CODEX_LOCAL_CONFIG: fakeConfig }
      }, {
        type: "task",
        prompt: "SECOND_CONCURRENCY_PROMPT",
        cwd: tempWorkspace,
        profile: "read-only"
      });
    } catch (error) {
      message = error.message;
    }
    if (!message.includes("Concurrency cap reached")) throw new Error(`unexpected concurrency result: ${message}`);
    const completed = await waitForJob(store, first.id, 10);
    if (completed.status !== "completed") throw new Error(`first job ended ${completed.status}`);
    return message;
  });

  await expect("cancelled job is not overwritten by late output", async () => {
    const fakeCodex = join(tempRoot, "fake-codex-cancel-race.mjs");
    const fakeConfig = join(tempRoot, "fake-cancel-race-config.json");
    await writeFile(fakeCodex, `#!/usr/bin/env node
process.on("SIGTERM", () => {
  console.log(JSON.stringify({ type: "thread.started", thread_id: "fake-thread-cancel-race" }));
  console.log(JSON.stringify({ type: "turn.completed", usage: { total_tokens: 1 } }));
  setTimeout(() => process.exit(0), 25);
});
setInterval(() => {}, 1000);
`, "utf8");
    await chmod(fakeCodex, 0o755);
    await writeFile(fakeConfig, JSON.stringify({
      defaultProfile: "workspace-write",
      cwdAllowlist: [tempWorkspace],
      codexBin: fakeCodex,
      maxConcurrentJobs: 2
    }), "utf8");
    const store = new JobStore(tempRoot, { logsDir: join(tempRoot, "fake-cancel-race-logs") });
    await store.init();
    const job = await startCodexJob({
      jobStore: store,
      env: { ...process.env, CODEX_BIN: fakeCodex, COWORK_CODEX_LOCAL_CONFIG: fakeConfig }
    }, {
      type: "task",
      prompt: "CANCEL_RACE_PROMPT",
      cwd: tempWorkspace,
      profile: "read-only"
    });
    await cancelJob(store, job.id);
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 500));
    const final = store.get(job.id);
    if (final.status !== "cancelled") throw new Error(`late output changed status to ${final.status}/${final.phase}`);
    return `${final.status}/${final.phase}`;
  });

  await expect("shutdown cancels active live jobs", async () => {
    const fakeCodex = join(tempRoot, "fake-codex-shutdown-cancel.mjs");
    const fakeConfig = join(tempRoot, "fake-shutdown-cancel-config.json");
    await writeFile(fakeCodex, `#!/usr/bin/env node
process.on("SIGTERM", () => setTimeout(() => process.exit(0), 25));
setInterval(() => {}, 1000);
`, "utf8");
    await chmod(fakeCodex, 0o755);
    await writeFile(fakeConfig, JSON.stringify({
      defaultProfile: "workspace-write",
      cwdAllowlist: [tempWorkspace],
      codexBin: fakeCodex,
      maxConcurrentJobs: 2
    }), "utf8");
    const store = new JobStore(tempRoot, { logsDir: join(tempRoot, "fake-shutdown-cancel-logs") });
    await store.init();
    const job = await startCodexJob({
      jobStore: store,
      env: { ...process.env, CODEX_BIN: fakeCodex, COWORK_CODEX_LOCAL_CONFIG: fakeConfig }
    }, {
      type: "task",
      prompt: "SHUTDOWN_CANCEL_PROMPT",
      cwd: tempWorkspace,
      profile: "workspace-write"
    });
    const cancelled = await cancelActiveJobs(store, "TEST_SHUTDOWN");
    if (cancelled.length !== 1) throw new Error(`cancelled ${cancelled.length} jobs`);
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 200));
    const final = store.get(job.id);
    if (final.status !== "cancelled" || final.phase !== "cancelled.shutdown") {
      throw new Error(`shutdown left ${final.status}/${final.phase}`);
    }
    if (final.errorMessage !== "TEST_SHUTDOWN") throw new Error(`unexpected reason: ${final.errorMessage}`);
    return `${final.status}/${final.phase}`;
  });

  await expect("spawn errors mark job failed", async () => {
    const fakeCodexDir = join(tempRoot, "fake-codex-directory");
    const fakeConfig = join(tempRoot, "fake-spawn-error-config.json");
    await mkdir(fakeCodexDir, { recursive: true });
    await writeFile(fakeConfig, JSON.stringify({
      defaultProfile: "workspace-write",
      cwdAllowlist: [tempWorkspace],
      codexBin: fakeCodexDir,
      maxConcurrentJobs: 2
    }), "utf8");
    const store = new JobStore(tempRoot, { logsDir: join(tempRoot, "spawn-error-logs") });
    await store.init();
    const job = await startCodexJob({
      jobStore: store,
      env: { ...process.env, CODEX_BIN: fakeCodexDir, COWORK_CODEX_LOCAL_CONFIG: fakeConfig }
    }, {
      type: "task",
      prompt: "SPAWN_ERROR_SHOULD_FAIL",
      cwd: tempWorkspace,
      profile: "read-only"
    });
    const failed = await waitForJob(store, job.id, 10);
    if (failed.status !== "failed") throw new Error(`spawn error job ended ${failed.status}`);
    if (!["process.spawn-error", "process.exited"].includes(failed.phase)) throw new Error(`unexpected phase ${failed.phase}`);
    return `${failed.phase}: ${failed.errorMessage || ""}`.slice(0, 160);
  });

  await expect("initialize", async () => {
    const response = await send("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "cowork-codex-selftest", version: "0.2.0" }
    });
    notify("notifications/initialized");
    if (response.result?.serverInfo?.name !== "cowork-codex") throw new Error("serverInfo mismatch");
    const pkg = JSON.parse(await readFile(packagePath, "utf8"));
    const manifest = JSON.parse(await readFile(pluginManifestPath, "utf8"));
    const serverVersion = response.result?.serverInfo?.version;
    if (serverVersion !== pkg.version || serverVersion !== manifest.version) {
      throw new Error(`version mismatch server=${serverVersion} package=${pkg.version} manifest=${manifest.version}`);
    }
    return `${response.result.protocolVersion} ${serverVersion}`;
  });

  let toolNames = [];
  await expect("tools/list", async () => {
    const response = await send("tools/list");
    const tools = response.result?.tools || [];
    toolNames = tools.map((tool) => tool.name).sort();
    const expected = ["codex_cancel_job", "codex_cwd_allowlist", "codex_delegate", "codex_job_result", "codex_job_status", "codex_set_max_concurrent_jobs", "codex_setup", "codex_start_review", "codex_start_task"].sort();
    for (const name of expected) {
      if (!toolNames.includes(name)) throw new Error(`missing ${name}`);
    }
    const resultTool = tools.find((tool) => tool.name === "codex_job_result");
    if (resultTool?.inputSchema?.required?.includes("id")) {
      throw new Error("codex_job_result still requires id");
    }
    return toolNames.join(", ");
  });

  await expect("codex_setup", async () => {
    const response = await callTool("codex_setup");
    const setup = data(response);
    if (setup.hostExecutionProof.platform !== process.platform) throw new Error(`expected ${process.platform}, got ${setup.hostExecutionProof.platform}`);
    if ("home" in setup.hostExecutionProof || "cwd" in setup.hostExecutionProof || "uname" in setup.hostExecutionProof) {
      throw new Error("hostExecutionProof includes unredacted host fields");
    }
    if (setup.codex.loginStatus.text || setup.codex.loginStatus.stdout || setup.codex.loginStatus.stderr) {
      throw new Error("loginStatus includes unredacted output");
    }
    if (!setup.codex.resolvedPath) throw new Error("no Codex path");
    if (process.platform === "darwin" && !setup.childProcess?.path?.includes("/opt/homebrew/bin")) {
      throw new Error(`child PATH missing Homebrew fallback: ${setup.childProcess?.path}`);
    }
    if (!setup.childProcess?.envPolicy?.includes("same limited child environment")) throw new Error(`missing child env policy: ${setup.childProcess?.envPolicy}`);
    if (setup.localConfig.path !== tempConfig) throw new Error("temporary config not used");
    return setup.codex.version.text;
  });

  await expect("codex_set_max_concurrent_jobs updates local config", async () => {
    const response = await callTool("codex_set_max_concurrent_jobs", { maxConcurrentJobs: 99 }, 30000);
    if (response.result?.isError) throw new Error(JSON.stringify(response.result.structuredContent));
    const updated = data(response);
    if (updated.maxConcurrentJobs !== 8) throw new Error(`maxConcurrentJobs was ${updated.maxConcurrentJobs}`);
    if (updated.effectiveMaxConcurrentJobs !== 8) throw new Error(`effective value was ${updated.effectiveMaxConcurrentJobs}`);
    const config = JSON.parse(await readFile(tempConfig, "utf8"));
    if (config.maxConcurrentJobs !== 8) throw new Error(`config file value was ${config.maxConcurrentJobs}`);
    return updated.warnings.join(" | ");
  });

  await expect("codex_cwd_allowlist lists active roots", async () => {
    const response = await callTool("codex_cwd_allowlist", {}, 30000);
    if (response.result?.isError) throw new Error(JSON.stringify(response.result.structuredContent));
    const result = data(response);
    const tempWorkspaceReal = await realpath(tempWorkspace);
    if (result.path !== tempConfig) throw new Error(`config path was ${result.path}`);
    if (!result.cwdAllowlist.includes(tempWorkspace)) throw new Error(`missing configured workspace: ${JSON.stringify(result.cwdAllowlist)}`);
    if (!result.activeRoots.includes(tempWorkspaceReal)) throw new Error(`missing active root ${tempWorkspaceReal}: ${JSON.stringify(result.activeRoots)}`);
    return result.activeRoots.join(", ");
  });

  const extraWorkspace = join(tempRoot, "extra-workspace");
  await mkdir(extraWorkspace, { recursive: true });
  const extraWorkspaceReal = await realpath(extraWorkspace);

  await expect("codex_cwd_allowlist dry-run add does not write config", async () => {
    const response = await callTool("codex_cwd_allowlist", { action: "add", path: extraWorkspace, dry_run: true }, 30000);
    if (response.result?.isError) throw new Error(JSON.stringify(response.result.structuredContent));
    const result = data(response);
    const config = JSON.parse(await readFile(tempConfig, "utf8"));
    if (!result.changed) throw new Error("dry-run add did not report changed");
    if (!result.added.includes(extraWorkspaceReal)) throw new Error(`dry-run added ${JSON.stringify(result.added)}`);
    if (config.cwdAllowlist.includes(extraWorkspaceReal)) throw new Error("dry-run wrote extra workspace");
    return result.added.join(", ");
  });

  await expect("codex_cwd_allowlist add preserves local config fields", async () => {
    const configBefore = JSON.parse(await readFile(tempConfig, "utf8"));
    configBefore.notes = "preserve me";
    await writeFile(tempConfig, `${JSON.stringify(configBefore, null, 2)}\n`, "utf8");
    const response = await callTool("codex_cwd_allowlist", { action: "add", path: extraWorkspace }, 30000);
    if (response.result?.isError) throw new Error(JSON.stringify(response.result.structuredContent));
    const result = data(response);
    const config = JSON.parse(await readFile(tempConfig, "utf8"));
    if (!result.changed) throw new Error("add did not report changed");
    if (!result.cwdAllowlist.includes(extraWorkspaceReal)) throw new Error(`missing added workspace: ${JSON.stringify(result.cwdAllowlist)}`);
    if (config.notes !== "preserve me") throw new Error(`notes field was not preserved: ${JSON.stringify(config)}`);
    if (config.maxConcurrentJobs !== 8) throw new Error(`maxConcurrentJobs changed: ${config.maxConcurrentJobs}`);
    return result.cwdAllowlist.join(", ");
  });

  await expect("codex_cwd_allowlist duplicate add is idempotent", async () => {
    const response = await callTool("codex_cwd_allowlist", { action: "add", path: extraWorkspace }, 30000);
    if (response.result?.isError) throw new Error(JSON.stringify(response.result.structuredContent));
    const result = data(response);
    if (result.changed) throw new Error(`duplicate add changed list: ${JSON.stringify(result)}`);
    if (result.added.length !== 0) throw new Error(`duplicate add reported additions: ${JSON.stringify(result.added)}`);
    return "unchanged";
  });

  await expect("codex_cwd_allowlist removes stale absolute entries", async () => {
    const stalePath = join(tempRoot, "missing-workspace");
    const configBefore = JSON.parse(await readFile(tempConfig, "utf8"));
    configBefore.cwdAllowlist = [...configBefore.cwdAllowlist, stalePath];
    await writeFile(tempConfig, `${JSON.stringify(configBefore, null, 2)}\n`, "utf8");
    const response = await callTool("codex_cwd_allowlist", { action: "remove", path: stalePath }, 30000);
    if (response.result?.isError) throw new Error(JSON.stringify(response.result.structuredContent));
    const result = data(response);
    const config = JSON.parse(await readFile(tempConfig, "utf8"));
    if (!result.removed.includes(stalePath)) throw new Error(`stale path not removed: ${JSON.stringify(result.removed)}`);
    if (config.cwdAllowlist.includes(stalePath)) throw new Error("stale path remained in config");
    return result.removed.join(", ");
  });

  await expect("codex_cwd_allowlist set replaces and can be restored", async () => {
    const setWorkspace = join(tempRoot, "set-workspace");
    await mkdir(setWorkspace, { recursive: true });
    const setWorkspaceReal = await realpath(setWorkspace);
    const setResponse = await callTool("codex_cwd_allowlist", { action: "set", paths: [setWorkspace] }, 30000);
    if (setResponse.result?.isError) throw new Error(JSON.stringify(setResponse.result.structuredContent));
    const setResult = data(setResponse);
    if (setResult.cwdAllowlist.length !== 1 || setResult.cwdAllowlist[0] !== setWorkspaceReal) {
      throw new Error(`set produced ${JSON.stringify(setResult.cwdAllowlist)}`);
    }
    if (!setResult.removed.length) throw new Error("set did not report removed entries");

    const restoreResponse = await callTool("codex_cwd_allowlist", { action: "set", paths: [tempWorkspace] }, 30000);
    if (restoreResponse.result?.isError) throw new Error(JSON.stringify(restoreResponse.result.structuredContent));
    const restoreResult = data(restoreResponse);
    const tempWorkspaceReal = await realpath(tempWorkspace);
    if (restoreResult.cwdAllowlist.length !== 1 || restoreResult.cwdAllowlist[0] !== tempWorkspaceReal) {
      throw new Error(`restore produced ${JSON.stringify(restoreResult.cwdAllowlist)}`);
    }
    return `${setResult.cwdAllowlist[0]} -> ${restoreResult.cwdAllowlist[0]}`;
  });

  await expect("codex_cwd_allowlist rejects relative add path", async () => {
    const response = await callTool("codex_cwd_allowlist", { action: "add", path: "relative-workspace" }, 30000);
    const message = response.result?.structuredContent?.error?.message || "";
    if (!response.result?.isError || !message.includes("absolute host paths")) {
      throw new Error(`expected relative path tool error, got ${JSON.stringify(response)}`);
    }
    return message;
  });

  await expect("input validation rejects non-array allowlist paths", async () => {
    const response = await callTool("codex_cwd_allowlist", { action: "set", paths: tempWorkspace }, 30000);
    if (response.error?.code !== -32602 || !response.error.message.includes("paths must be an array")) {
      throw new Error(`expected -32602 paths array error, got ${JSON.stringify(response)}`);
    }
    return response.error.message;
  });

  await expect("input validation rejects unknown allowlist action", async () => {
    const response = await callTool("codex_cwd_allowlist", { action: "replace", paths: [tempWorkspace] }, 30000);
    if (response.error?.code !== -32602 || !response.error.message.includes("action must be one of")) {
      throw new Error(`expected -32602 action error, got ${JSON.stringify(response)}`);
    }
    return response.error.message;
  });

  await expect("input validation rejects unknown field", async () => {
    const response = await callTool("codex_setup", { unexpected: true }, 30000);
    if (response.error?.code !== -32602 || !response.error.message.includes("Unknown field")) {
      throw new Error(`expected -32602 unknown field, got ${JSON.stringify(response)}`);
    }
    return response.error.message;
  });

  await expect("input validation rejects invalid model", async () => {
    const response = await callTool("codex_start_task", {
      prompt: "Reply with exactly: SHOULD_NOT_RUN",
      cwd: tempWorkspace,
      profile: "read-only",
      model: "bad model"
    }, 30000);
    if (response.error?.code !== -32602 || !response.error.message.includes("model")) {
      throw new Error(`expected -32602 model error, got ${JSON.stringify(response)}`);
    }
    return response.error.message;
  });

  await expect("input validation rejects empty prompt", async () => {
    const response = await callTool("codex_start_task", {
      prompt: "",
      cwd: tempWorkspace,
      profile: "read-only"
    }, 30000);
    if (response.error?.code !== -32602 || !response.error.message.includes("prompt")) {
      throw new Error(`expected -32602 prompt error, got ${JSON.stringify(response)}`);
    }
    return response.error.message;
  });

  await expect("input validation rejects review base plus commit", async () => {
    const response = await callTool("codex_start_review", {
      cwd: tempWorkspace,
      base: "main",
      commit: "HEAD"
    }, 30000);
    if (response.error?.code !== -32602 || !response.error.message.includes("either base or commit")) {
      throw new Error(`expected -32602 base/commit error, got ${JSON.stringify(response)}`);
    }
    return response.error.message;
  });

  await expect("input validation rejects status wait without id", async () => {
    const response = await callTool("codex_job_status", { wait_seconds: 1 }, 30000);
    if (response.error?.code !== -32602 || !response.error.message.includes("wait_seconds requires id")) {
      throw new Error(`expected -32602 wait/id error, got ${JSON.stringify(response)}`);
    }
    return response.error.message;
  });

  await expect("outside cwd rejected", async () => {
    const outside = join(tempRoot, "outside");
    await mkdir(outside, { recursive: true });
    const response = await callTool("codex_start_task", {
      prompt: "Reply with exactly: SHOULD_NOT_RUN",
      cwd: outside,
      profile: "read-only",
      wait_seconds: 1
    }, 30000);
    const message = response.result?.structuredContent?.error?.message || "";
    if (!response.result?.isError || (!message.includes("cwd is outside") && !message.includes("No cwd allowlist"))) {
      throw new Error(`expected MCP isError allowlist error, got ${JSON.stringify(response)}`);
    }
    return message;
  });

  await expect("unknown job result is MCP tool error", async () => {
    const response = await callTool("codex_job_result", { id: "job-does-not-exist" }, 30000);
    const message = response.result?.structuredContent?.error?.message || "";
    if (!response.result?.isError || !message.includes("Unknown job id")) {
      throw new Error(`expected MCP isError unknown job, got ${JSON.stringify(response)}`);
    }
    return message;
  });

  await expect("bare codex_job_result reports no terminal job", async () => {
    const response = await callTool("codex_job_result", {}, 30000);
    const message = response.result?.structuredContent?.error?.message || "";
    if (!response.result?.isError || !message.includes("No completed, failed, cancelled, or rejected Codex job")) {
      throw new Error(`expected MCP isError no terminal job, got ${JSON.stringify(response)}`);
    }
    return message;
  });

  let cancelJobId = null;
  await expect("codex_delegate cancel target", async () => {
    const response = await callTool("codex_delegate", {
      prompt: "Before replying, run a harmless sleep command for 30 seconds, then reply CANCEL_TARGET.",
      cwd: tempWorkspace,
      profile: "read-only"
    }, 30000);
    const job = data(response).job;
    cancelJobId = job.id;
    if (!["running", "queued"].includes(job.status)) throw new Error(`expected running/queued, got ${job.status}`);
    return job.id;
  });

  await expect("codex_cancel_job", async () => {
    const response = await callTool("codex_cancel_job", { id: cancelJobId });
    const job = data(response).job;
    if (job.status !== "cancelled") throw new Error(`expected cancelled, got ${job.status}`);
    return job.id;
  });

  await expect("codex_job_result includes phase for cancelled job", async () => {
    const response = await callTool("codex_job_result", { id: cancelJobId });
    const result = data(response);
    if (result.status !== "cancelled") throw new Error(`expected cancelled result, got ${result.status}`);
    if (!result.phase) throw new Error(`missing phase: ${JSON.stringify(result)}`);
    return `${result.status}/${result.phase}`;
  });

  await expect("bare codex_job_result returns latest terminal job", async () => {
    const response = await callTool("codex_job_result", {});
    const result = data(response);
    if (result.id !== cancelJobId) throw new Error(`expected latest terminal ${cancelJobId}, got ${result.id}`);
    if (result.status !== "cancelled") throw new Error(`expected cancelled result, got ${result.status}`);
    return result.id;
  });

  let completedJobId = null;
  let completedThreadId = null;
  await expect("codex_start_task real job", async () => {
    const response = await callTool("codex_start_task", {
      prompt: "Reply with exactly: BRIDGE_OK",
      cwd: tempWorkspace,
      profile: "read-only",
      wait_seconds: 60
    }, 180000);
    const job = data(response).job;
    completedJobId = job.id;
    completedThreadId = job.threadId;
    if (job.status !== "completed") throw new Error(`job ${job.id} ended ${job.status}: ${job.errorMessage || ""}`);
    if (!job.threadId) throw new Error("completed job did not expose a thread id");
    return `${job.id} ${job.threadId || ""}`.trim();
  });

  await expect("codex_job_result contains BRIDGE_OK", async () => {
    if (!completedJobId) throw new Error("real job did not complete");
    const response = await callTool("codex_job_result", { id: completedJobId });
    const result = data(response);
    if (!String(result.finalMessage || "").includes("BRIDGE_OK")) {
      throw new Error(`final message did not include BRIDGE_OK: ${JSON.stringify(result.finalMessage)}`);
    }
    return result.threadId || "no-thread-id";
  });

  await expect("bare codex_job_result returns completed job", async () => {
    if (!completedJobId) throw new Error("real job did not complete");
    const response = await callTool("codex_job_result", {});
    const result = data(response);
    if (result.id !== completedJobId) throw new Error(`expected latest terminal ${completedJobId}, got ${result.id}`);
    if (!String(result.finalMessage || "").includes("BRIDGE_OK")) {
      throw new Error(`final message did not include BRIDGE_OK: ${JSON.stringify(result.finalMessage)}`);
    }
    return result.id;
  });

  let resumedThreadId = null;
  await expect("codex_start_task resume latest", async () => {
    const response = await callTool("codex_start_task", {
      prompt: "Reply with exactly: RESUME_LATEST_OK",
      cwd: tempWorkspace,
      profile: "read-only",
      resume: "latest",
      wait_seconds: 60
    }, 180000);
    const job = data(response).job;
    resumedThreadId = job.threadId;
    if (job.status !== "completed") throw new Error(`resume latest ended ${job.status}: ${job.errorMessage || ""}`);
    if (job.threadId !== completedThreadId) throw new Error(`resume latest used ${job.threadId}, expected ${completedThreadId}`);
    if (!String(job.finalMessagePreview || "").includes("RESUME_LATEST_OK")) {
      const resultResponse = await callTool("codex_job_result", { id: job.id });
      const result = data(resultResponse);
      if (!String(result.finalMessage || "").includes("RESUME_LATEST_OK")) throw new Error(`resume latest final message was ${result.finalMessage}`);
    }
    return job.threadId;
  });

  await expect("codex_start_task resume explicit", async () => {
    const response = await callTool("codex_start_task", {
      prompt: "Reply with exactly: RESUME_EXPLICIT_OK",
      cwd: tempWorkspace,
      profile: "read-only",
      resume: resumedThreadId || completedThreadId,
      wait_seconds: 60
    }, 180000);
    const job = data(response).job;
    if (job.status !== "completed") throw new Error(`resume explicit ended ${job.status}: ${job.errorMessage || ""}`);
    if (job.threadId !== completedThreadId) throw new Error(`resume explicit used ${job.threadId}, expected ${completedThreadId}`);
    const resultResponse = await callTool("codex_job_result", { id: job.id });
    const result = data(resultResponse);
    if (!String(result.finalMessage || "").includes("RESUME_EXPLICIT_OK")) throw new Error(`resume explicit final message was ${result.finalMessage}`);
    return job.threadId;
  });

  await expect("codex_cancel_job leaves terminal job unchanged", async () => {
    const response = await callTool("codex_cancel_job", { id: completedJobId });
    const job = data(response).job;
    if (job.status !== "completed") throw new Error(`terminal cancel changed status to ${job.status}`);
    return `${job.id} remained ${job.status}`;
  });

  let standardReviewId = null;
  await expect("prepare git review fixture", async () => {
    await prepareReviewFixture();
    const status = await git(["status", "--short"], tempReviewWorkspace);
    if (!status.includes("review-target.js")) throw new Error(`expected dirty review fixture, got ${status}`);
    return status;
  });

  await expect("codex_start_review standard live job", async () => {
    const response = await callTool("codex_start_review", {
      cwd: tempReviewWorkspace,
      mode: "standard",
      scope: "working-tree",
      focus: "Focus only on review-target.js and the changed arithmetic."
    }, 240000);
    const started = data(response).job;
    standardReviewId = started.id;
    const job = await waitForToolJobComplete(started.id, 300);
    if (job.status !== "completed") throw new Error(`standard review ${job.id} ended ${job.status}: ${job.errorMessage || ""}`);
    return `${job.id} ${job.reviewTarget || ""}`.trim();
  });

  await expect("codex_job_result standard review has output", async () => {
    const response = await callTool("codex_job_result", { id: standardReviewId });
    const result = data(response);
    if (!String(result.finalMessage || "").trim()) {
      throw new Error(`standard review final message was empty: ${JSON.stringify(result)}`);
    }
    return String(result.finalMessage).slice(0, 120).replace(/\s+/g, " ");
  });

  let adversarialReviewId = null;
  await expect("codex_start_review adversarial live job", async () => {
    const response = await callTool("codex_start_review", {
      cwd: tempReviewWorkspace,
      mode: "adversarial",
      scope: "working-tree",
      focus: "Focus only on review-target.js and the changed arithmetic."
    }, 240000);
    const started = data(response).job;
    adversarialReviewId = started.id;
    const job = await waitForToolJobComplete(started.id, 300);
    if (job.status !== "completed") throw new Error(`adversarial review ${job.id} ended ${job.status}: ${job.errorMessage || ""}`);
    return `${job.id} ${job.reviewTarget || ""}`.trim();
  });

  await expect("codex_job_result adversarial review has output", async () => {
    const response = await callTool("codex_job_result", { id: adversarialReviewId });
    const result = data(response);
    if (!String(result.finalMessage || "").trim()) {
      throw new Error(`adversarial review final message was empty: ${JSON.stringify(result)}`);
    }
    return String(result.finalMessage).slice(0, 120).replace(/\s+/g, " ");
  });
} catch {
  exitCode = 1;
} finally {
  child.stdin.end();
  child.kill("SIGTERM");
  console.log("stderr:");
  console.log(stderr.trim() || "(empty)");
  const failed = checks.filter((check) => !check.ok).length;
  console.log(failed === 0 ? "PASS overall" : `FAIL overall (${failed} failed)`);
}

process.exitCode = exitCode;
