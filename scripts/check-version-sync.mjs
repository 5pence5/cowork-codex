#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const readJson = async (path) => JSON.parse(await readFile(resolve(root, path), "utf8"));

const pkg = await readJson("package.json");
const plugin = await readJson(".claude-plugin/plugin.json");
const marketplace = await readJson(".claude-plugin/marketplace.json");

const expected = pkg.version;
const checks = [
  ["plugin.json version", plugin.version],
  ["marketplace metadata version", marketplace.metadata?.version],
  ["marketplace plugin version", marketplace.plugins?.[0]?.version]
];

const mismatches = checks.filter(([, actual]) => actual !== expected);
if (mismatches.length) {
  for (const [label, actual] of mismatches) {
    console.error(`${label} is ${actual || "<missing>"}, expected ${expected}`);
  }
  process.exit(1);
}

console.log(`version sync ok: ${expected}`);
