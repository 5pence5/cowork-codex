import { access, mkdir, readFile, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, parse, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { buildCodexChildEnv, buildCodexChildPath } from "./child-env.mjs";
import { codexExecutableNames, defaultConfigPath, isHostAbsolutePath, pathEnvKey, pathEnvValue, toolBinDirs } from "./platform.mjs";
import { buildCommandInvocation } from "./command-invocation.mjs";

const execFileAsync = promisify(execFile);
const TESTED_CODEX_VERSION = "codex-cli 0.142.5";
const DEFAULT_LOCAL_CONFIG_PATH = defaultConfigPath();
const DEFAULT_PROFILE_VALUES = new Set(["read-only", "workspace-write"]);
const PROFILE_VALUES = new Set(["read-only", "workspace-write", "full-local-access"]);
const DEFAULT_MAX_CONCURRENT_JOBS = 8;
const MAX_CONCURRENT_JOBS_LIMIT = 8;

export { DEFAULT_LOCAL_CONFIG_PATH, DEFAULT_MAX_CONCURRENT_JOBS, MAX_CONCURRENT_JOBS_LIMIT, TESTED_CODEX_VERSION };

async function isExecutable(path) {
  if (!path) return false;
  try {
    await access(path, process.platform === "win32" ? constants.F_OK : constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export async function firstExecutablePathLine(stdout = "") {
  for (const line of String(stdout).split(/\r?\n/)) {
    const candidate = line.trim();
    if (candidate && isHostAbsolutePath(candidate) && await isExecutable(candidate)) {
      return candidate;
    }
  }
  return "";
}

export function parseCodexLoginStatus(loginText = "", commandOk = false) {
  const text = String(loginText);
  const method = text.match(/Logged in using\s+([A-Za-z0-9._ -]+)/)?.[1]?.trim() || null;
  const explicitlyNotLoggedIn = /\b(not\s+logged\s+in|logged\s+out|unauthenticated)\b/i.test(text);
  const explicitlyLoggedIn = Boolean(method) || /\blogged\s+in\b/i.test(text);
  return {
    loggedIn: Boolean(commandOk && explicitlyLoggedIn && !explicitlyNotLoggedIn),
    method
  };
}

function parseCodexCliVersion(value = "") {
  const match = String(value).match(/\bcodex-cli\s+(\d+)\.(\d+)\.(\d+)\b/);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3])
  };
}

async function run(command, args, options = {}) {
  try {
    const invocation = buildCommandInvocation(command, args, { env: options.env ?? process.env });
    const { stdout, stderr } = await execFileAsync(invocation.command, invocation.args, {
      ...invocation.options,
      windowsHide: true,
      timeout: options.timeout ?? 10000,
      maxBuffer: options.maxBuffer ?? 1024 * 1024,
      env: options.env ?? process.env
    });
    return {
      ok: true,
      stdout: stdout.trim(),
      stderr: stderr.trim(),
      exitCode: 0
    };
  } catch (error) {
    return {
      ok: false,
      stdout: String(error.stdout ?? "").trim(),
      stderr: String(error.stderr ?? error.message ?? "").trim(),
      exitCode: typeof error.code === "number" ? error.code : null
    };
  }
}

export async function resolveCodexBinary(env = process.env, localConfig = null) {
  const attempts = [];
  const childPath = buildCodexChildPath(env);

  if (env.CODEX_BIN) {
    const candidate = env.CODEX_BIN;
    const ok = await isExecutable(candidate);
    attempts.push({ step: "CODEX_BIN", path: candidate, ok });
    if (ok) {
      return { path: candidate, foundBy: "CODEX_BIN", attempts };
    }
  }

  if (localConfig?.codexBin) {
    const candidate = localConfig.codexBin;
    const ok = await isExecutable(candidate);
    attempts.push({ step: "local-config:codexBin", path: candidate, ok });
    if (ok) {
      return { path: candidate, foundBy: "local-config:codexBin", attempts };
    }
  }

  const lookupCommand = process.platform === "win32" ? "where.exe" : "/bin/sh";
  const lookupArgs = process.platform === "win32" ? ["codex"] : ["-lc", "command -v codex"];
  const lookupEnv = { ...env };
  lookupEnv[pathEnvKey(lookupEnv)] = childPath;
  const shellResult = await run(lookupCommand, lookupArgs, {
    env: lookupEnv
  });
  const shellPath = shellResult.ok ? await firstExecutablePathLine(shellResult.stdout) : "";
  const shellStdoutLineCount = shellResult.stdout ? shellResult.stdout.split(/\r?\n/).filter(Boolean).length : 0;
  const shellOk = Boolean(shellPath);
  attempts.push({
    step: "path-command-lookup",
    command: process.platform === "win32" ? "where.exe codex" : "/bin/sh -lc 'command -v codex'",
    path: shellPath || null,
    ok: shellOk,
    ignoredStdoutLines: Math.max(0, shellStdoutLineCount - (shellPath ? 1 : 0)) || undefined,
    stderr: shellResult.stderr || undefined
  });
  if (shellOk) {
    return { path: shellPath, foundBy: "path-command-lookup", attempts };
  }

  const knownLocations = [];
  for (const dir of toolBinDirs(env)) {
    for (const name of codexExecutableNames()) {
      knownLocations.push(join(dir, name));
    }
  }

  for (const candidate of knownLocations) {
    const ok = await isExecutable(candidate);
    attempts.push({ step: "known-location", path: candidate, ok });
    if (ok) {
      return { path: candidate, foundBy: `known-location:${candidate}`, attempts };
    }
  }

  return { path: null, foundBy: null, attempts };
}

export function localConfigPath(env = process.env) {
  return env.COWORK_CODEX_LOCAL_CONFIG || defaultConfigPath(env);
}

function normalizeDefaultProfile(value, warnings) {
  if (value === undefined || value === null || value === "") return "workspace-write";
  if (DEFAULT_PROFILE_VALUES.has(value)) return value;
  warnings.push(`Ignoring unsupported defaultProfile "${String(value)}"; using workspace-write.`);
  return "workspace-write";
}

function normalizeAllowedProfiles(value, warnings = []) {
  if (value === undefined || value === null) return [...PROFILE_VALUES];
  if (!Array.isArray(value)) {
    warnings.push("Ignoring allowedProfiles because it is not an array.");
    return [...PROFILE_VALUES];
  }
  const next = [];
  for (const entry of value) {
    if (PROFILE_VALUES.has(entry)) {
      if (!next.includes(entry)) next.push(entry);
    } else {
      warnings.push(`Ignoring unsupported allowedProfiles entry "${String(entry)}".`);
    }
  }
  return next.length ? next : [...PROFILE_VALUES];
}

function normalizeAllowlistEdits(value, warnings = []) {
  if (value === undefined || value === null) return true;
  if (typeof value === "boolean") return value;
  warnings.push("Ignoring allowlistEdits because it is not a boolean.");
  return true;
}

export function normalizeMaxConcurrentJobs(value, warnings = []) {
  if (value === undefined || value === null || value === "") return DEFAULT_MAX_CONCURRENT_JOBS;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    warnings.push(`Ignoring invalid maxConcurrentJobs "${String(value)}"; using ${DEFAULT_MAX_CONCURRENT_JOBS}.`);
    return DEFAULT_MAX_CONCURRENT_JOBS;
  }
  const integer = Math.trunc(parsed);
  const clamped = Math.min(MAX_CONCURRENT_JOBS_LIMIT, Math.max(1, integer));
  if (clamped !== parsed) {
    warnings.push(`Clamped maxConcurrentJobs from ${String(value)} to ${clamped}.`);
  }
  return clamped;
}

async function readEditableLocalConfig(configPath) {
  if (!configPath) throw new Error("No local config path is configured.");
  let parsed = {
    defaultProfile: "workspace-write",
    cwdAllowlist: [],
    codexBin: null
  };
  let created = false;

  try {
    const raw = await readFile(configPath, "utf8");
    const valueFromDisk = JSON.parse(raw);
    if (!valueFromDisk || typeof valueFromDisk !== "object" || Array.isArray(valueFromDisk)) {
      throw new Error("local config must be a JSON object");
    }
    parsed = valueFromDisk;
  } catch (error) {
    if (error?.code === "ENOENT") {
      created = true;
    } else {
      throw error;
    }
  }

  return { parsed, created };
}

async function writeEditableLocalConfig(configPath, parsed) {
  await mkdir(dirname(configPath), { recursive: true });
  const tempPath = `${configPath}.${process.pid}.${Date.now()}.tmp`;
  try {
    await writeFile(tempPath, `${JSON.stringify(parsed, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    await rename(tempPath, configPath);
  } catch (error) {
    await rm(tempPath, { force: true }).catch(() => {});
    throw error;
  }
}

export async function setLocalMaxConcurrentJobs(configPath, value) {
  const warnings = [];
  const maxConcurrentJobs = normalizeMaxConcurrentJobs(value, warnings);
  const { parsed, created } = await readEditableLocalConfig(configPath);

  parsed.maxConcurrentJobs = maxConcurrentJobs;
  await writeEditableLocalConfig(configPath, parsed);

  return {
    path: configPath,
    created,
    maxConcurrentJobs,
    warnings
  };
}

function isPlaceholderAllowlistEntry(value) {
  return String(value || "").trim().startsWith("<");
}

async function validateAllowlistPath(value) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("paths entries must be non-empty strings.");
  }
  if (isPlaceholderAllowlistEntry(value)) {
    throw new Error(`paths entries must be real host folders, got placeholder: ${value}`);
  }
  if (!isHostAbsolutePath(value)) {
    throw new Error(`cwdAllowlist paths must be absolute host paths: ${value}`);
  }
  const resolved = resolve(value);
  const info = await stat(resolved).catch((error) => {
    throw new Error(`cwdAllowlist path does not exist: ${value}${error?.message ? ` (${error.message})` : ""}`);
  });
  if (!info.isDirectory()) {
    throw new Error(`cwdAllowlist path is not a directory: ${value}`);
  }
  const canonical = await realpath(resolved);
  if (canonical === parse(canonical).root) {
    throw new Error(`cwdAllowlist path must not be the filesystem root: ${value}`);
  }
  return canonical;
}

async function keyForAllowlistEntry(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  const resolved = isHostAbsolutePath(value) ? resolve(value) : value;
  return realpath(resolved).catch(() => resolved);
}

async function dedupeAllowlist(entries) {
  const seen = new Set();
  const next = [];
  for (const entry of entries) {
    if (typeof entry !== "string" || !entry.trim()) continue;
    const key = await keyForAllowlistEntry(entry);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    next.push(entry);
  }
  return next;
}

function validateAllowlistRemovePath(value) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("paths entries must be non-empty strings.");
  }
  if (isPlaceholderAllowlistEntry(value)) {
    throw new Error(`paths entries must be real host folders, got placeholder: ${value}`);
  }
  if (!isHostAbsolutePath(value)) {
    throw new Error(`cwdAllowlist paths must be absolute host paths: ${value}`);
  }
  return value;
}

async function activeAllowlistRoots(entries) {
  const roots = [];
  for (const entry of entries) {
    if (typeof entry !== "string" || !entry.trim() || isPlaceholderAllowlistEntry(entry) || !isHostAbsolutePath(entry)) continue;
    try {
      const resolved = resolve(entry);
      const info = await stat(resolved);
      if (info.isDirectory()) roots.push(await realpath(resolved));
    } catch {
      // Stale entries remain visible in cwdAllowlist but are not active roots.
    }
  }
  return dedupeAllowlist(roots);
}

export async function updateLocalCwdAllowlist(configPath, action = "list", paths = [], options = {}) {
  if (!["list", "add", "remove", "set"].includes(action)) {
    throw new Error("action must be one of list, add, remove, set.");
  }
  if (!Array.isArray(paths)) {
    throw new Error("paths must be an array.");
  }

  const { parsed, created } = await readEditableLocalConfig(configPath);
  const current = Array.isArray(parsed.cwdAllowlist)
    ? parsed.cwdAllowlist.filter((entry) => typeof entry === "string" && entry.trim())
    : [];
  const previousCwdAllowlist = [...current];
  const warnings = [];
  if (parsed.cwdAllowlist !== undefined && !Array.isArray(parsed.cwdAllowlist)) {
    warnings.push("Replacing ignored cwdAllowlist because it is not an array.");
  }
  if (action !== "list" && normalizeAllowlistEdits(parsed.allowlistEdits, warnings) === false) {
    throw new Error("cwdAllowlist edits are disabled by local config.");
  }

  let next = [...current];
  let added = [];
  let removed = [];

  if (action === "add") {
    if (paths.length === 0) throw new Error("paths is required for action add.");
    const validated = [];
    for (const path of paths) validated.push(await validateAllowlistPath(path));
    next = await dedupeAllowlist([
      ...current.filter((entry) => !isPlaceholderAllowlistEntry(entry)),
      ...validated
    ]);
    const previousKeys = new Set((await Promise.all(current.map((entry) => keyForAllowlistEntry(entry)))).filter(Boolean));
    added = [];
    for (const entry of next) {
      const key = await keyForAllowlistEntry(entry);
      if (key && !previousKeys.has(key)) added.push(entry);
    }
  } else if (action === "remove") {
    if (paths.length === 0) throw new Error("paths is required for action remove.");
    const validated = paths.map((entry) => validateAllowlistRemovePath(entry));
    const removeOriginals = new Set(validated);
    const removeKeys = new Set((await Promise.all(validated.map((entry) => keyForAllowlistEntry(entry)))).filter(Boolean));
    next = [];
    for (const entry of current) {
      const key = await keyForAllowlistEntry(entry);
      if (removeOriginals.has(entry) || (key && removeKeys.has(key))) {
        removed.push(entry);
      } else {
        next.push(entry);
      }
    }
  } else if (action === "set") {
    const validated = [];
    for (const path of paths) validated.push(await validateAllowlistPath(path));
    next = await dedupeAllowlist(validated);
    const nextKeys = new Set((await Promise.all(next.map((entry) => keyForAllowlistEntry(entry)))).filter(Boolean));
    const previousKeys = new Set((await Promise.all(current.map((entry) => keyForAllowlistEntry(entry)))).filter(Boolean));
    added = [];
    removed = [];
    for (const entry of next) {
      const key = await keyForAllowlistEntry(entry);
      if (key && !previousKeys.has(key)) added.push(entry);
    }
    for (const entry of current) {
      const key = await keyForAllowlistEntry(entry);
      if (key && !nextKeys.has(key)) removed.push(entry);
    }
  }

  const changed = JSON.stringify(previousCwdAllowlist) !== JSON.stringify(next);
  const activeRoots = await activeAllowlistRoots(next);
  if (action !== "list" && changed && !options.dryRun) {
    parsed.cwdAllowlist = next;
    await writeEditableLocalConfig(configPath, parsed);
  }

  return {
    path: configPath,
    action,
    dryRun: Boolean(options.dryRun),
    created,
    changed,
    previousCwdAllowlist,
    cwdAllowlist: next,
    activeRoots,
    added,
    removed,
    warnings
  };
}

export async function readLocalConfig(configPath) {
  const warnings = [];
  const fallback = {
    defaultProfile: "workspace-write",
    cwdAllowlist: [],
    allowedProfiles: [...PROFILE_VALUES],
    allowlistEdits: true,
    maxConcurrentJobs: DEFAULT_MAX_CONCURRENT_JOBS,
    codexBin: null,
    codexBinConfigured: false,
    source: "defaults",
    path: configPath || null,
    exists: false,
    warnings
  };

  if (!configPath) {
    return fallback;
  }

  try {
    const raw = await readFile(configPath, "utf8");
    const parsed = JSON.parse(raw);
    const fileWarnings = [];
    const cwdAllowlist = Array.isArray(parsed.cwdAllowlist) ? parsed.cwdAllowlist : [];
    if (parsed.cwdAllowlist !== undefined && !Array.isArray(parsed.cwdAllowlist)) {
      fileWarnings.push("Ignoring cwdAllowlist because it is not an array.");
    }
    const codexBin = typeof parsed.codexBin === "string" && parsed.codexBin ? parsed.codexBin : null;
    if (parsed.codexBin !== undefined && parsed.codexBin !== null && !codexBin) {
      fileWarnings.push("Ignoring codexBin because it is not a non-empty string.");
    }
    return {
      defaultProfile: normalizeDefaultProfile(parsed.defaultProfile, fileWarnings),
      cwdAllowlist,
      allowedProfiles: normalizeAllowedProfiles(parsed.allowedProfiles, fileWarnings),
      allowlistEdits: normalizeAllowlistEdits(parsed.allowlistEdits, fileWarnings),
      maxConcurrentJobs: normalizeMaxConcurrentJobs(parsed.maxConcurrentJobs, fileWarnings),
      codexBin,
      codexBinConfigured: Boolean(codexBin),
      source: "file",
      path: configPath,
      exists: true,
      warnings: fileWarnings
    };
  } catch (error) {
    if (error?.code === "ENOENT") {
      return {
        defaultProfile: "workspace-write",
        cwdAllowlist: [],
        allowedProfiles: [...PROFILE_VALUES],
        allowlistEdits: true,
        maxConcurrentJobs: DEFAULT_MAX_CONCURRENT_JOBS,
        codexBin: null,
        codexBinConfigured: false,
        source: "missing",
        path: configPath,
        exists: false,
        warnings: []
      };
    }
    return {
      ...fallback,
      source: "error",
      error: error.message
    };
  }
}

export async function collectCodexSetup(env = process.env) {
  const localConfig = await readLocalConfig(localConfigPath(env));
  const codexResolution = await resolveCodexBinary(env, localConfig);
  const childEnv = buildCodexChildEnv(env);

  const [codexVersion, loginStatus] = await Promise.all([
    codexResolution.path ? run(codexResolution.path, ["--version"], { env: childEnv }) : Promise.resolve({ ok: false, stdout: "", stderr: "codex not found", exitCode: null }),
    codexResolution.path ? run(codexResolution.path, ["login", "status"], { env: childEnv }) : Promise.resolve({ ok: false, stdout: "", stderr: "codex not found", exitCode: null })
  ]);

  const versionText = codexVersion.stdout || codexVersion.stderr;
  const loginText = loginStatus.stdout || loginStatus.stderr;
  const parsedLogin = parseCodexLoginStatus(loginText, loginStatus.ok);
  const warnings = [];
  if (!codexResolution.path) {
    warnings.push("Codex binary was not found.");
  }
  const testedVersion = parseCodexCliVersion(TESTED_CODEX_VERSION);
  const foundVersion = parseCodexCliVersion(versionText);
  if (versionText && (!testedVersion || !foundVersion || testedVersion.major !== foundVersion.major || testedVersion.minor !== foundVersion.minor)) {
    warnings.push(`Tested with ${TESTED_CODEX_VERSION}; found ${versionText}. Run a smoke test after Codex major/minor upgrades.`);
  }
  if (localConfig.source === "error") {
    warnings.push(`Could not read local config: ${localConfig.error}`);
  }
  warnings.push(...(localConfig.warnings || []));
  if (localConfig.source === "missing") {
    warnings.push(`Local config is missing. Copy the example config to ${localConfig.path} and set cwdAllowlist before running task or review jobs.`);
  }

  return {
    hostExecutionProof: {
      platform: process.platform,
      arch: process.arch,
      homeConfigured: Boolean(env.HOME ?? homedir())
    },
    codex: {
      resolvedPath: codexResolution.path,
      foundBy: codexResolution.foundBy,
      discoveryAttempts: codexResolution.attempts,
      version: {
        ok: codexVersion.ok,
        text: versionText,
        exitCode: codexVersion.exitCode
      },
      loginStatus: {
        ok: loginStatus.ok,
        loggedIn: parsedLogin.loggedIn,
        method: parsedLogin.method,
        exitCode: loginStatus.exitCode
      }
    },
    node: {
      version: process.version,
      execPath: process.execPath
    },
    childProcess: {
      path: pathEnvValue(childEnv),
      envPolicy: "codex setup probes use the same limited child environment as Codex jobs"
    },
    localConfig,
    warnings,
    testedWith: TESTED_CODEX_VERSION
  };
}
