#!/usr/bin/env node
// Enforces tool-name prefixes: advertiser tools must be `kadam_adv_*`,
// publisher tools `kadam_pub_*`. Catches cross-cabinet naming drift.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const CABINETS = [
  { dir: "src/tools/advertiser", prefix: "kadam_adv_" },
  { dir: "src/tools/publisher", prefix: "kadam_pub_" },
];

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (full.endsWith(".ts") && !full.endsWith("index.ts")) out.push(full);
  }
  return out;
}

const offenders = [];
let found = 0;
for (const { dir, prefix } of CABINETS) {
  for (const file of walk(dir)) {
    const text = readFileSync(file, "utf8");
    for (const m of text.matchAll(/["'`](kadam_(?:adv|pub)_[a-z0-9_]+)["'`]/g)) {
      found++;
      const name = m[1];
      if (!name.startsWith(prefix)) {
        offenders.push(`${relative(".", file)}: "${name}" should start with "${prefix}"`);
      }
    }
  }
}

if (offenders.length) {
  console.error("Tool-naming gate failed:\n  " + offenders.join("\n  "));
  process.exit(1);
}
if (found === 0) {
  console.error("Tool-naming gate failed: no kadam_adv_/kadam_pub_ tool names found (scan broken?).");
  process.exit(1);
}
console.log(`Tool-naming gate OK (${found} tool-name references checked).`);
