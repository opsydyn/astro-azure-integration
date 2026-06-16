import { describe, expect, it } from "vitest";

import azureSwaAdapter from "../src/index.js";
import packageJson from "../package.json" with { type: "json" };

describe("azureSwaAdapter", () => {
  it("registers an Astro-native preview entrypoint", () => {
    const integration = azureSwaAdapter();
    let adapter: unknown;

    integration.hooks["astro:config:done"]?.({
      setAdapter(value: unknown) {
        adapter = value;
      },
    } as never);

    expect(adapter).toMatchObject({
      name: "@opsydyn/astro-azure-swa",
      entrypointResolution: "auto",
      serverEntrypoint: "@opsydyn/astro-azure-swa/server",
      previewEntrypoint: "@opsydyn/astro-azure-swa/preview",
    });
  });

  it("exposes the preview entrypoint for Astro's require.resolve preview loader", () => {
    expect(packageJson.exports["./preview"]).toMatchObject({
      import: {
        types: "./dist/preview.d.mts",
        default: "./dist/preview.mjs",
      },
      default: "./dist/preview.mjs",
    });
  });
});
