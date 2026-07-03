import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const TESTED_CODEX_VERSION = "codex-cli 0.142.5";
const DEFAULT_LOCAL_CONFIG_PATH = join(homedir(), ".config", "cowork-codex", "cowork-codex.local.json");
const DEFAULT_PROFILE_VALUES = new Set(["read-only", "workspace-write"]);
const DEFAULT_MAX_CONCURRENT_JOBS = 2;
const MAX_CONCURRENT_JOBS_LIMIT = 8;

export { DEFAULT_LOCAL_CONFIG_PATH, TESTED_CODEX_VERSION };

async function isExecutable(path) {
  if (!path) return false;
  try {
    await access(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

async function run(command, args, options = {}) {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
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

  const shellResult = await run("/bin/zsh", ["-lc", "command -v codex"], { env });
  const shellPath = shellResult.stdout.split(/\r?\n/).find(Boolean) ?? "";
  const shellOk = shellResult.ok && await isExecutable(shellPath);
  attempts.push({
    step: "login-shell-command-v",
    command: "/bin/zsh -lc 'command -v codex'",
    path: shellPath || null,
    ok: shellOk,
    stderr: shellResult.stderr || undefined
  });
  if (shellOk) {
    return { path: shellPath, foundBy: "login-shell-command-v", attempts };
  }

  const knownLocations = [
    join(homedir(), ".npm-global/bin/codex"),
    "/opt/homebrew/bin/codex",
    "/usr/local/bin/codex"
  ];

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
  return env.COWORK_CODEX_LOCAL_CONFIG || DEFAULT_LOCAL_CONFIG_PATH;
}

function normalizeDefaultProfile(value, warnings) {
  if (value === undefined || value === null || value === "") return "workspace-write";
  if (DEFAULT_PROFILE_VALUES.has(value)) return value;
  warnings.push(`Ignoring unsupported defaultProfile "${String(value)}"; using workspace-write. Use full-local-access only as an explicit per-job profile.`);
  return "workspace-write";
}

function normalizeMaxConcurrentJobs(value, warnings) {
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

export async function readLocalConfig(configPath) {
  const warnings = [];
  const fallback = {
    defaultProfile: "workspace-write",
    cwdAllowlist: [],
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

  const [codexVersion, loginStatus] = await Promise.all([
    codexResolution.path ? run(codexResolution.path, ["--version"], { env }) : Promise.resolve({ ok: false, stdout: "", stderr: "codex not found", exitCode: null }),
    codexResolution.path ? run(codexResolution.path, ["login", "status"], { env }) : Promise.resolve({ ok: false, stdout: "", stderr: "codex not found", exitCode: null })
  ]);

  const versionText = codexVersion.stdout || codexVersion.stderr;
  const loginText = loginStatus.stdout || loginStatus.stderr;
  const loginMethod = loginText.match(/Logged in using\s+([A-Za-z0-9._ -]+)/)?.[1]?.trim() || null;
  const warnings = [];
  if (!codexResolution.path) {
    warnings.push("Codex binary was not found.");
  }
  if (versionText && versionText !== TESTED_CODEX_VERSION) {
    warnings.push(`Tested with ${TESTED_CODEX_VERSION}; found ${versionText}. Treat Codex upgrades as breaking until smoke-tested.`);
  }
  if (localConfig.source === "error") {
    warnings.push(`Could not read local config: ${localConfig.error}`);
  }
  warnings.push(...(localConfig.warnings || []));
  if (localConfig.source === "missing") {
    warnings.push(`Local config is missing. Copy .local/cowork-codex.local.json.example to ${localConfig.path} and set cwdAllowlist before running task or review jobs.`);
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
        loggedIn: loginStatus.ok && /logged in/i.test(loginText),
        method: loginMethod,
        exitCode: loginStatus.exitCode
      }
    },
    node: {
      version: process.version,
      execPath: process.execPath
    },
    localConfig,
    warnings,
    testedWith: TESTED_CODEX_VERSION
  };
}
