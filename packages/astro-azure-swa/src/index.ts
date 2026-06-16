import type { AstroIntegration } from "astro";

export interface AzureSwaAdapterOptions {
  functionName?: string;
}

export default function azureSwaAdapter(
  _options: AzureSwaAdapterOptions = {},
): AstroIntegration {
  return {
    name: "@opsydyn/astro-azure-swa",
    hooks: {},
  };
}
