const BASE_ENV_ALLOWLIST = new Set([
  "PATH",
  "HOME",
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
  "HOME",
  "CODEX_HOME",
  "USER",
  "LOGNAME",
  "SHELL",
  "TMPDIR",
  "LANG",
  "LC_*",
  "TERM"
];

export function buildCodexChildEnv(sourceEnv = process.env) {
  const childEnv = {};
  for (const [name, value] of Object.entries(sourceEnv)) {
    if (
      BASE_ENV_ALLOWLIST.has(name) ||
      name.startsWith("LC_")
    ) {
      childEnv[name] = value;
    }
  }
  return childEnv;
}
