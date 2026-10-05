#!/usr/bin/env node
// Guards against accidental bundle bloat. Run after `npm run build`.
import { statSync } from "node:fs";

const BUNDLE = "dist/index.js";
// 39 -> 72 инструментов в эпике KUI-6770: старый потолок 256 KB стал ниже честного
// размера сборки, порог поднят до 384 KB (сейчас ~264 KB) и снова ловит только рост.
const MAX_BYTES = 384 * 1024;

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
