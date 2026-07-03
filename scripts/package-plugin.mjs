#!/usr/bin/env node
import { mkdir, readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
const outDir = resolve(root, "dist");
const outPath = resolve(outDir, `cowork-codex-v${pkg.version}.zip`);

await mkdir(outDir, { recursive: true });
await execFileAsync("git", ["archive", "--format=zip", "-o", outPath, "HEAD"], {
  cwd: root,
  timeout: 30000
});

console.log(outPath);

