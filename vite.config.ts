import { defineConfig } from "vite";
import { builtinModules } from "node:module";

export default defineConfig({
  build: {
    target: "node18",
    lib: {
      entry: "src/index.ts",
      formats: ["es"],
      fileName: "index",
    },
    rollupOptions: {
      external: [
        ...builtinModules,
        ...builtinModules.map((m) => `node:${m}`),
        "@modelcontextprotocol/sdk",
        /^@modelcontextprotocol\/sdk\//,
        "pino",
        /^pino\//,
        "pino-pretty",
        "zod",
      ],
      output: {
        // Emit a single self-contained dist/index.js. The transport switch in
        // index.ts uses dynamic import(); without inlining, Rollup splits it into
        // sibling chunks that the .mcpb bundle (cp dist/index.js) doesn't include,
        // breaking `node server/index.js`.
        inlineDynamicImports: true,
      },
    },
    sourcemap: true,
    minify: false,
  },
});
