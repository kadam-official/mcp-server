#!/usr/bin/env tsx
/**
 * Tenant-isolation gate: "no module-level mutable state".
 *
 * The HTTP transport serves many partners from one process, so any mutable
 * state at module scope is a cross-tenant leak risk. Walks every `.ts` under
 * `src/` with ts-morph and fails on:
 *
 *   1. Module-level `let` / `var` declarations.
 *   2. Mutable `static` class fields (must be `static readonly`).
 *
 * Module-level `new Map/Set` is advisory-only (warns), and the long-lived
 * session store in `*-bootstrap.ts` composition roots is allowlisted — that
 * Map is keyed by SDK session id and guarded by `isSessionAuthorized`
 * (bearer + cabinet), which is the legitimate per-process session store.
 *
 * Exit 0 = pass, 1 = violations.
 */

import * as path from "node:path";
import * as process from "node:process";

import { Node, Project, SyntaxKind } from "ts-morph";

const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const SRC_DIR = path.join(REPO_ROOT, "src");

interface Violation {
  readonly file: string;
  readonly line: number;
  readonly rule: string;
  readonly message: string;
}

async function main(): Promise<number> {
  const project = new Project({
    tsConfigFilePath: path.join(REPO_ROOT, "tsconfig.json"),
    skipAddingFilesFromTsConfig: true,
  });

  const sourceFiles = project.addSourceFilesAtPaths([
    `${SRC_DIR}/**/*.ts`,
    `!${SRC_DIR}/**/*.d.ts`,
  ]);

  if (sourceFiles.length === 0) {
    console.log("No src/ files yet — nothing to check.");
    return 0;
  }

  const violations: Violation[] = [];

  for (const sf of sourceFiles) {
    const rel = path.relative(REPO_ROOT, sf.getFilePath());

    // Rule 1: module-level `let` / `var`.
    for (const stmt of sf.getVariableStatements()) {
      const kind = stmt.getDeclarationKind();
      if (kind === "let" || kind === "var") {
        violations.push({
          file: rel,
          line: stmt.getStartLineNumber(),
          rule: "no-module-let",
          message: `Module-level \`${kind}\` is forbidden. Use \`const\` at module scope.`,
        });
      }
    }

    // Rule 2: mutable static class fields.
    for (const cls of sf.getClasses()) {
      for (const prop of cls.getStaticProperties()) {
        if (!Node.isPropertyDeclaration(prop)) continue;
        const isReadonly = prop.isReadonly();
        const hasInitializer = prop.getInitializer() !== undefined;
        if (!isReadonly && hasInitializer) {
          violations.push({
            file: rel,
            line: prop.getStartLineNumber(),
            rule: "no-mutable-static-field",
            message:
              `Mutable static field \`${cls.getName() ?? "<anonymous>"}.${prop.getName()}\` ` +
              `is forbidden. Use \`static readonly\` or move to instance state.`,
          });
        }
      }
    }

    // Rule 3 (advisory): module-level Map/Set literals outside composition
    // roots. The session store in `*-bootstrap.ts` is allowlisted.
    for (const stmt of sf.getVariableStatements()) {
      if (stmt.getDeclarationKind() !== "const") continue;
      for (const decl of stmt.getDeclarations()) {
        const init = decl.getInitializer();
        if (!init) continue;
        if (
          init.getKind() === SyntaxKind.NewExpression &&
          /^new\s+(Map|Set|WeakMap|WeakSet)\b/.test(init.getText())
        ) {
          if (rel.endsWith("-bootstrap.ts")) continue;
          // Constant lookup tables (initialized from an array literal, e.g.
          // `new Set([429, 500])`) are immutable in practice and hold no
          // tenant data — skip the advisory.
          if (Node.isNewExpression(init)) {
            const firstArg = init.getArguments()[0];
            if (firstArg && Node.isArrayLiteralExpression(firstArg)) continue;
          }
          console.warn(
            `[advisory] ${rel}:${String(stmt.getStartLineNumber())} ` +
              `module-level mutable container (${init.getText().split("(")[0] ?? "?"}). ` +
              `If this holds tenant-scoped data, it MUST live inside a per-request ` +
              `closure, not at module scope.`,
          );
        }
      }
    }
  }

  if (violations.length === 0) {
    console.log(`check-shared-state: ${sourceFiles.length} files OK.`);
    return 0;
  }

  console.error(`check-shared-state: ${violations.length} violation(s):\n`);
  for (const v of violations) {
    console.error(`  ${v.file}:${String(v.line)}  [${v.rule}]  ${v.message}`);
  }
  console.error(
    "\nTenant-isolation gate: no module-level mutable state. Failures are not optional.",
  );
  return 1;
}

const code = await main();
process.exit(code);
