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
});
