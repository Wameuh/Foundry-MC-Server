import { defineConfig } from "vite";

export default defineConfig({
  build: {
    emptyOutDir: true,
    lib: {
      entry: "src/main.ts",
      formats: ["es"],
      fileName: () => "foundry-mcp.js",
    },
    rollupOptions: {
      output: { inlineDynamicImports: true },
    },
    sourcemap: true,
    target: "es2022",
  },
});
