import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { generateAzureSwaFiles } from "../src/generate.js";

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "astro-azure-swa-"));
  await mkdir(join(root, "dist"), { recursive: true });
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

function distUrl(): URL {
  return pathToFileURL(`${join(root, "dist")}/`);
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(join(root, "dist", path), "utf8"));
}

describe("generateAzureSwaFiles", () => {
  it("writes host.json and api/package.json at the function app root", async () => {
    await generateAzureSwaFiles({
      distDir: distUrl(),
      functionName: "server",
    });

    expect(await readJson("api/host.json")).toEqual({
      version: "2.0",
      extensions: {
        http: {
          routePrefix: "",
        },
      },
    });

    expect(await readJson("api/package.json")).toEqual({
      type: "module",
      main: "server/index.mjs",
      dependencies: {
        "@azure/functions": "^4.0.0",
        "astro": "^6.0.0",
      },
    });
  });

  it("writes an Azure Functions v4 HTTP entrypoint and bridge", async () => {
    await generateAzureSwaFiles({
      distDir: distUrl(),
      functionName: "server",
    });

    const index = await readFile(
      join(fileURLToPath(distUrl()), "api/server/index.mjs"),
      "utf8",
    );

    expect(index).toContain('app.http("server"');
    expect(index).toContain('route: "{*path}"');
    expect(index).toContain("createApp()");
    expect(index).toContain('from "./bridge.mjs"');

    const bridge = await readFile(
      join(fileURLToPath(distUrl()), "api/server/bridge.mjs"),
      "utf8",
    );

    expect(bridge).toContain("function toWebRequest");
    expect(bridge).toContain("function toAzureResponse");
  });

  it("writes staticwebapp.config.json with asset caching and SSR fallback", async () => {
    await generateAzureSwaFiles({
      distDir: distUrl(),
      functionName: "server",
    });

    expect(await readJson("staticwebapp.config.json")).toEqual({
      navigationFallback: {
        rewrite: "/api/server",
      },
      routes: [
        {
          route: "/_astro/*",
          headers: {
            "cache-control": "public, max-age=31536000, immutable",
          },
        },
      ],
    });
  });
});
