import type { AstroIntegration } from "astro";

import { generateAzureSwaFiles } from "./generate.js";

const ADAPTER_NAME = "@opsydyn/astro-azure-swa";

export interface AzureSwaAdapterOptions {
  functionName?: string;
}

export default function azureSwaAdapter(
  options: AzureSwaAdapterOptions = {},
): AstroIntegration {
  const functionName = options.functionName ?? "server";

  return {
    name: ADAPTER_NAME,
    hooks: {
      "astro:config:done": ({ setAdapter }) => {
        setAdapter({
          name: ADAPTER_NAME,
          entrypointResolution: "auto",
          serverEntrypoint: `${ADAPTER_NAME}/server`,
          previewEntrypoint: `${ADAPTER_NAME}/preview`,
          supportedAstroFeatures: {
            staticOutput: "stable",
            serverOutput: "stable",
            hybridOutput: "stable",
            sharpImageService: "stable",
            envGetSecret: "stable",
          },
          adapterFeatures: {
            buildOutput: "server",
            middlewareMode: "classic",
          },
        });
      },
      "astro:build:done": async ({ dir }) => {
        await generateAzureSwaFiles({
          distDir: dir,
          functionName,
        });
      },
    },
  };
}
