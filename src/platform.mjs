import { homedir } from "node:os";
import { delimiter, posix, win32 } from "node:path";

export function pathDelimiter(platform = process.platform) {
  return platform === "win32" ? ";" : delimiter;
}

export function pathEnvKey(env = process.env, platform = process.platform) {
  if (platform !== "win32") return "PATH";
  return Object.keys(env).find((key) => key.toLowerCase() === "path") || "Path";
}

export function pathEnvValue(env = process.env, platform = process.platform) {
  return String(env[pathEnvKey(env, platform)] || "");
}

export function hostPathApi(platform = process.platform) {
  return platform === "win32" ? win32 : posix;
}

export function isHostAbsolutePath(value, platform = process.platform) {
  return hostPathApi(platform).isAbsolute(value);
}

export function defaultConfigPath(env = process.env, platform = process.platform) {
  const pathApi = hostPathApi(platform);
  const home = env.HOME || env.USERPROFILE || homedir();
  if (platform === "win32") {
    return pathApi.join(env.APPDATA || pathApi.join(home, "AppData", "Roaming"), "cowork-codex", "cowork-codex.local.json");
  }
  return pathApi.join(env.XDG_CONFIG_HOME || pathApi.join(home, ".config"), "cowork-codex", "cowork-codex.local.json");
}

export function defaultLogsPath(env = process.env, platform = process.platform) {
  const pathApi = hostPathApi(platform);
  const home = env.HOME || env.USERPROFILE || homedir();
  if (platform === "win32") {
    return pathApi.join(env.LOCALAPPDATA || env.APPDATA || pathApi.join(home, "AppData", "Local"), "cowork-codex", "logs");
  }
  return pathApi.join(env.XDG_STATE_HOME || pathApi.join(home, ".local", "state"), "cowork-codex", "logs");
}

export function codexExecutableNames(platform = process.platform) {
  return platform === "win32"
    ? ["codex.cmd", "codex.exe", "codex.bat", "codex"]
    : ["codex"];
}

export function toolBinDirs(env = process.env, platform = process.platform) {
  const pathApi = hostPathApi(platform);
  const home = env.HOME || env.USERPROFILE || homedir();
  const dirs = [];
  const add = (entry) => {
    if (entry && !dirs.includes(entry)) dirs.push(entry);
  };

  if (platform === "win32") {
    add(env.APPDATA ? pathApi.join(env.APPDATA, "npm") : null);
    add(env.LOCALAPPDATA ? pathApi.join(env.LOCALAPPDATA, "npm") : null);
    add(home ? pathApi.join(home, "AppData", "Roaming", "npm") : null);
    add(env.ProgramFiles ? pathApi.join(env.ProgramFiles, "nodejs") : null);
    add(env["ProgramFiles(x86)"] ? pathApi.join(env["ProgramFiles(x86)"], "nodejs") : null);
    return dirs;
  }

  if (home) {
    add(pathApi.join(home, ".npm-global", "bin"));
    add(pathApi.join(home, ".local", "bin"));
  }
  if (platform === "darwin") add("/opt/homebrew/bin");
  add("/usr/local/bin");
  add("/usr/bin");
  add("/bin");
  add("/usr/sbin");
  add("/sbin");
  return dirs;
}
