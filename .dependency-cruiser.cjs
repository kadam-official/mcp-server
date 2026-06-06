/**
 * dependency-cruiser config — architecture import gate.
 * Run: npm run check:imports
 */
module.exports = {
  forbidden: [
    {
      name: "no-circular",
      severity: "error",
      comment:
        "Runtime circular dependencies make modules hard to reason about and test. " +
        "Type-only cycles are ignored (tsPreCompilationDeps: false).",
      from: {},
      to: { circular: true },
    },
    {
      name: "tools-no-cross-cabinet",
      severity: "error",
      comment:
        "Advertiser and publisher tool modules must not import each other (cabinet isolation).",
      from: { path: "^src/tools/advertiser/" },
      to: { path: "^src/tools/publisher/" },
    },
    {
      name: "tools-no-cross-cabinet-rev",
      severity: "error",
      comment:
        "Advertiser and publisher tool modules must not import each other (cabinet isolation).",
      from: { path: "^src/tools/publisher/" },
      to: { path: "^src/tools/advertiser/" },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    tsConfig: { fileName: "tsconfig.json" },
    // Analyze runtime (value) imports only; `import type` cycles are erased at
    // compile time and are not a runtime concern.
    tsPreCompilationDeps: false,
    enhancedResolveOptions: {
      extensions: [".ts", ".js"],
    },
  },
};
