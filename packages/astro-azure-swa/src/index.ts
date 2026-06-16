import type { AstroIntegration } from "astro";

import {
  generateAzureSwaFiles,
  type AzureSwaApiRuntime,
  type AzureSwaStaticWebAppConfig,
} from "./generate.js";

const ADAPTER_NAME = "@opsydyn/astro-azure-swa";

export interface AzureSwaAdapterOptions {
  apiRuntime?: AzureSwaApiRuntime;
  functionName?: string;
  staticWebAppConfig?: AzureSwaStaticWebAppConfig;
}

export default function azureSwaAdapter(
  options: AzureSwaAdapterOptions = {},
): AstroIntegration {
  const functionName = options.functionName ?? "server";

  let projectRoot: URL | undefined;

  return {
    name: ADAPTER_NAME,
    hooks: {
      "astro:config:done": ({ setAdapter, config }) => {
        if (config?.root) projectRoot = config.root;
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
          apiRuntime: options.apiRuntime,
          distDir: dir,
          functionName,
          projectRoot,
          staticWebAppConfig: options.staticWebAppConfig,
        });
      },
    },
  };
}
