#!/usr/bin/env node
// Guards against accidental bundle bloat. Run after `npm run build`.
import { statSync } from "node:fs";

const BUNDLE = "dist/index.js";
const MAX_BYTES = 256 * 1024; // 256 KB (current ~146 KB)

let size;
try {
  size = statSync(BUNDLE).size;
} catch {
  console.error(`Bundle not found: ${BUNDLE}. Run \`npm run build\` first.`);
  process.exit(1);
}

const kb = (size / 1024).toFixed(1);
if (size > MAX_BYTES) {
  console.error(`Bundle-size gate failed: ${BUNDLE} is ${kb} KB (max ${MAX_BYTES / 1024} KB).`);
  process.exit(1);
}
console.log(`Bundle-size gate OK: ${BUNDLE} is ${kb} KB (max ${MAX_BYTES / 1024} KB).`);
