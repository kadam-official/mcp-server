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
    },
    sourcemap: true,
    minify: false,
  },
});
