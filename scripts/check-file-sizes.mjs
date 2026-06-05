#!/usr/bin/env node
// Fails if any source file exceeds MAX_LINES, to keep modules small and
// reviewable. Known pre-existing outliers are allow-listed so the gate
// catches *new* bloat without forcing an immediate refactor.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const MAX_LINES = 500;
const ROOT = "src";
const EXCEPTIONS = new Set([
  // Large tool module with many campaign field definitions; tracked for
  // future split, allow-listed for now.
  "src/tools/advertiser/campaigns.ts",
]);

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (full.endsWith(".ts")) out.push(full);
  }
  return out;
}

const offenders = [];
for (const file of walk(ROOT)) {
  const rel = relative(".", file);
  if (EXCEPTIONS.has(rel)) continue;
  const lines = readFileSync(file, "utf8").split("\n").length;
  if (lines > MAX_LINES) offenders.push(`${rel}: ${lines} lines (max ${MAX_LINES})`);
}

if (offenders.length) {
  console.error("File-size gate failed:\n  " + offenders.join("\n  "));
  process.exit(1);
}
console.log(`File-size gate OK (max ${MAX_LINES} lines/file).`);
