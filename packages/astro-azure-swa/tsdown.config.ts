import { defineConfig } from "tsdown";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    server: "src/server.ts",
    bridge: "src/bridge.ts",
    preview: "src/preview.ts",
  },
  format: ["esm"],
  dts: true,
  clean: true,
  sourcemap: true,
  target: "node22",
  outDir: "dist",
  deps: {
    neverBundle: ["astro", "@azure/functions"],
  },
});
