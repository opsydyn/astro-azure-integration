import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";
import react from "@astrojs/react";
import azureSwa from "@opsydyn/astro-azure-swa";

export default defineConfig({
  output: "server",
  adapter: azureSwa({
    apiRuntime: "node:22",
  }),
  integrations: [mdx(), react()],
  markdown: {
    shikiConfig: {
      theme: "dracula",
    },
  },
  vite: {
    ssr: {
      // @opsydyn/elysia-spectral dynamically imports @stoplight/spectral-core (CJS).
      // In Node.js ESM, CJS named exports added via __exportStar aren't statically
      // detectable, so import("@stoplight/spectral-core").Spectral is undefined.
      // Bundling via Rollup's CJS plugin transforms the module at build time and
      // exposes all named exports (including Spectral) correctly.
      noExternal: ["@opsydyn/elysia-spectral"],
    },
  },
});
