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

export function buildCodexChildPath(sourceEnv = process.env) {
  const entries = [];
  const add = (entry) => {
    if (entry && !entries.includes(entry)) entries.push(entry);
  };
  for (const entry of String(sourceEnv.PATH || "").split(":")) {
    add(entry);
  }
  add("/opt/homebrew/bin");
  add("/usr/local/bin");
  if (sourceEnv.HOME) add(`${sourceEnv.HOME}/.npm-global/bin`);
  add("/usr/bin");
  add("/bin");
  add("/usr/sbin");
  add("/sbin");
  return entries.join(":");
}

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
  childEnv.PATH = buildCodexChildPath(sourceEnv);
  return childEnv;
}
