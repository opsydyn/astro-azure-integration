import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";
import react from "@astrojs/react";
import azureSwa from "@opsydyn/astro-azure-swa";
import foldkit from "@opsydyn/astro-foldkit";

export default defineConfig({
  output: "server",
  adapter: azureSwa({
    apiRuntime: "node:22",
  }),
  integrations: [mdx(), react(), foldkit()],
  vite: {
    optimizeDeps: {
      include: ["foldkit", "foldkit/html", "foldkit/message"],
    },
  },
  markdown: {
    shikiConfig: {
      theme: "dracula",
    },
  },
});
