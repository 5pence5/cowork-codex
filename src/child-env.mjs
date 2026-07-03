import { pathDelimiter, pathEnvKey, pathEnvValue, toolBinDirs } from "./platform.mjs";

const BASE_ENV_ALLOWLIST = new Set([
  "PATH",
  "Path",
  "HOME",
  "USERPROFILE",
  "APPDATA",
  "LOCALAPPDATA",
  "ProgramFiles",
  "ProgramFiles(x86)",
  "SystemRoot",
  "ComSpec",
  "PATHEXT",
  "TEMP",
  "TMP",
  "CODEX_HOME",
  "USER",
  "LOGNAME",
  "SHELL",
  "TMPDIR",
  "LANG",
  "TERM"
]);

export const CHILD_ENV_ALLOWLIST = [
  "PATH",
  "Path",
  "HOME",
  "USERPROFILE",
  "APPDATA",
  "LOCALAPPDATA",
  "CODEX_HOME",
  "USER",
  "LOGNAME",
  "SHELL",
  "TMPDIR",
  "LANG",
  "LC_*",
  "TERM"
];

export function buildCodexChildPath(sourceEnv = process.env, options = {}) {
  const platform = options.platform || process.platform;
  const delimiter = pathDelimiter(platform);
  const entries = [];
  const add = (entry) => {
    if (entry && !entries.includes(entry)) entries.push(entry);
  };
  for (const entry of pathEnvValue(sourceEnv, platform).split(delimiter)) {
    add(entry);
  }
  for (const entry of toolBinDirs(sourceEnv, platform)) add(entry);
  return entries.join(delimiter);
}

export function buildCodexChildEnv(sourceEnv = process.env, options = {}) {
  const platform = options.platform || process.platform;
  const pathKey = pathEnvKey(sourceEnv, platform);
  const childEnv = {};
  for (const [name, value] of Object.entries(sourceEnv)) {
    if (
      BASE_ENV_ALLOWLIST.has(name) ||
      (platform === "win32" && name.toLowerCase() === "path") ||
      name.startsWith("LC_")
    ) {
      childEnv[name] = value;
    }
  }
  childEnv[pathKey] = buildCodexChildPath(sourceEnv, { platform });
  return childEnv;
}
