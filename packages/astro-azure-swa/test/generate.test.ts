import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { generateAzureSwaFiles } from "../src/generate.js";

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "astro-azure-swa-"));
  await mkdir(join(root, "dist", "client"), { recursive: true });
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
          routePrefix: "api",
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

  it("writes an Azure Functions v4 HTTP entrypoint and bridge fallback", async () => {
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

  it("writes staticwebapp.config.json with asset caching and SSR rewrite", async () => {
    await generateAzureSwaFiles({
      distDir: distUrl(),
      functionName: "server",
    });

    expect(await readJson("client/staticwebapp.config.json")).toEqual({
      routes: [
        {
          route: "/_astro/*",
          headers: {
            "cache-control": "public, max-age=31536000, immutable",
          },
        },
        {
          route: "/*",
          rewrite: "/api/server",
        },
      ],
    });
  });

  it("writes api files beside client when Astro passes dist/client as dir", async () => {
    await mkdir(join(root, "dist", "client"), { recursive: true });

    await generateAzureSwaFiles({
      distDir: pathToFileURL(`${join(root, "dist", "client")}/`),
      functionName: "server",
    });

    expect(await readJson("api/package.json")).toMatchObject({
      main: "server/index.mjs",
    });
    expect(await readJson("client/staticwebapp.config.json")).toMatchObject({
      routes: expect.arrayContaining([
        {
          route: "/*",
          rewrite: "/api/server",
        },
      ]),
    });
  });

  it("copies Astro's bundled server entry when it exists", async () => {
    await mkdir(join(root, "dist", "server", "chunks"), { recursive: true });
    await writeFile(
      join(root, "dist", "server", "entry.mjs"),
      'import "./chunks/page.mjs";\nexport async function handleAzureSwaRequest() {}\n',
      "utf8",
    );
    await writeFile(
      join(root, "dist", "server", "chunks", "page.mjs"),
      "export const page = true;\n",
      "utf8",
    );

    await generateAzureSwaFiles({
      distDir: pathToFileURL(`${join(root, "dist", "client")}/`),
      functionName: "server",
    });

    await expect(
      readFile(join(root, "dist", "api", "server", "index.mjs"), "utf8"),
    ).resolves.toContain('from "./entry.mjs"');
    await expect(
      readFile(join(root, "dist", "api", "server", "index.mjs"), "utf8"),
    ).resolves.toContain('app.http("server"');
    await expect(
      readFile(join(root, "dist", "api", "server", "chunks", "page.mjs"), "utf8"),
    ).resolves.toContain("page = true");
  });
});
