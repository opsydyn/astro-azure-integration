import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import azureSwa from "@opsydyn/astro-azure-swa";

export default defineConfig({
  output: "server",
  adapter: azureSwa({
    apiRuntime: "node:22",
  }),
  integrations: [react()],
});
