#!/usr/bin/env node
import { access, copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { execFile } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { normalizeMaxConcurrentJobs } from "../src/codex-discovery.mjs";
import { defaultConfigPath } from "../src/platform.mjs";

const execFileAsync = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const defaultInstallConfigPath = defaultConfigPath();
const exampleConfigPath = resolve(root, ".local", "cowork-codex.local.json.example");

function usage() {
  return `Usage:
  npm run install:cowork -- [options]

Options:
  --allowlist <path>      Trusted host folder. Repeat for multiple folders.
  --config <path>         Config path. Defaults to the per-platform Cowork Codex config path.
  --codex-bin <path>      Absolute Codex binary path to write into config.
  --max-concurrent-jobs <n>
                           Active Codex job cap to write into config. Clamped from 1 to 8.
  --skip-plugin-install   Only create/update config and validate; do not run claude plugin install.
  --dry-run               Print actions without changing files or installing.
  --help                  Show this help.

If no --allowlist is supplied and the config does not exist, the repo root is used as the initial allowlist entry.`;
}

function parseArgs(argv) {
  const options = {
    allowlist: [],
    configPath: defaultInstallConfigPath,
    codexBin: null,
    maxConcurrentJobs: null,
    warnings: [],
    dryRun: false,
    skipPluginInstall: false
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--skip-plugin-install") {
      options.skipPluginInstall = true;
    } else if (arg === "--allowlist") {
      const value = argv[++i];
      if (!value) throw new Error("--allowlist requires a path");
      options.allowlist.push(resolve(value));
    } else if (arg === "--config") {
      const value = argv[++i];
      if (!value) throw new Error("--config requires a path");
      options.configPath = resolve(value);
    } else if (arg === "--codex-bin") {
      const value = argv[++i];
      if (!value) throw new Error("--codex-bin requires a path");
      options.codexBin = resolve(value);
    } else if (arg === "--max-concurrent-jobs") {
      const value = argv[++i];
      if (!value) throw new Error("--max-concurrent-jobs requires a number");
      options.maxConcurrentJobs = normalizeMaxConcurrentJobs(value, options.warnings);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

async function exists(path) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function writeJson(path, value, dryRun) {
  if (dryRun) return;
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function run(command, args, options) {
  const rendered = [command, ...args].join(" ");
  if (options.dryRun) {
    console.log(`[dry-run] ${rendered}`);
    return;
  }
  console.log(`$ ${rendered}`);
  const { stdout, stderr } = await execFileAsync(command, args, {
    cwd: root,
    timeout: 120000,
    maxBuffer: 1024 * 1024
  });
  if (stdout.trim()) console.log(stdout.trim());
  if (stderr.trim()) console.error(stderr.trim());
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return;
  }

  const configExists = await exists(options.configPath);
  let config;
  if (configExists) {
    config = await readJson(options.configPath);
  } else {
    config = await readJson(exampleConfigPath);
    config.cwdAllowlist = options.allowlist.length ? options.allowlist : [root];
  }

  if (options.allowlist.length) config.cwdAllowlist = options.allowlist;
  if (options.codexBin) config.codexBin = options.codexBin;
  if (options.maxConcurrentJobs !== null) config.maxConcurrentJobs = options.maxConcurrentJobs;
  for (const warning of options.warnings) {
    console.error(`Warning: ${warning}`);
  }

  if (options.dryRun) {
    console.log(`[dry-run] write ${options.configPath}`);
    console.log(JSON.stringify(config, null, 2));
  } else if (configExists) {
    await writeJson(options.configPath, config, false);
  } else {
    await mkdir(dirname(options.configPath), { recursive: true });
    await copyFile(exampleConfigPath, options.configPath);
    await writeJson(options.configPath, config, false);
  }

  await run("claude", ["plugin", "validate", "--strict", root], options);

  if (!options.skipPluginInstall) {
    await run("claude", ["plugin", "marketplace", "add", root], options);
    await run("claude", ["plugin", "install", "cowork-codex@cowork-codex", "--scope", "user"], options);
  }

  console.log("");
  console.log("Cowork Codex install step complete.");
  console.log(`Config: ${options.configPath}`);
  console.log("Next: run /reload-plugins in Cowork, run /mcp, then call codex_setup.");
}

try {
  await main();
} catch (error) {
  console.error(error.message);
  console.error("");
  console.error(usage());
  process.exitCode = 1;
}
