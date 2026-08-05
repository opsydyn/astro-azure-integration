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
  await writeProjectPackage({
    dependencies: {
      astro: "7.0.0",
      react: "19.2.7",
    },
  });
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

function distUrl(): URL {
  return pathToFileURL(`${join(root, "dist")}/`);
}

function projectRootUrl(): URL {
  return pathToFileURL(`${root}/`);
}

async function writeProjectPackage(
  overrides: {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    optionalDependencies?: Record<string, string>;
  },
): Promise<void> {
  await writeFile(
    join(root, "package.json"),
    `${JSON.stringify({ name: "fixture-app", ...overrides }, null, 2)}\n`,
    "utf8",
  );
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(join(root, "dist", path), "utf8"));
}

describe("generateAzureSwaFiles", () => {
  it("writes host.json and api/package.json at the function app root", async () => {
    await generateAzureSwaFiles({
      distDir: distUrl(),
      functionName: "server",
      projectRoot: projectRootUrl(),
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
        astro: "7.0.0",
        react: "19.2.7",
      },
    });
  });

  it("uses Astro from devDependencies when it is not a runtime dependency", async () => {
    await writeProjectPackage({
      devDependencies: { astro: "7.1.6" },
    });

    await generateAzureSwaFiles({
      distDir: distUrl(),
      functionName: "server",
      projectRoot: projectRootUrl(),
    });

    await expect(readJson("api/package.json")).resolves.toMatchObject({
      dependencies: { astro: "7.1.6" },
    });
  });

  it("rejects a missing Astro dependency", async () => {
    await writeProjectPackage({ dependencies: { react: "19.2.7" } });

    await expect(
      generateAzureSwaFiles({
        distDir: distUrl(),
        functionName: "server",
        projectRoot: projectRootUrl(),
      }),
    ).rejects.toThrow(/Astro 7 dependency/i);
  });

  it("rejects an Astro 6 dependency", async () => {
    await writeProjectPackage({ dependencies: { astro: "6.0.0" } });

    await expect(
      generateAzureSwaFiles({
        distDir: distUrl(),
        functionName: "server",
        projectRoot: projectRootUrl(),
      }),
    ).rejects.toThrow(/Astro 7/i);
  });

  it("reports malformed project manifests", async () => {
    await writeFile(join(root, "package.json"), "{\n", "utf8");

    await expect(
      generateAzureSwaFiles({
        distDir: distUrl(),
        functionName: "server",
        projectRoot: projectRootUrl(),
      }),
    ).rejects.toThrow(/package.json/i);
  });

  it("writes an Azure Functions v4 HTTP entrypoint and bridge fallback", async () => {
    await generateAzureSwaFiles({
      distDir: distUrl(),
      functionName: "server",
      projectRoot: projectRootUrl(),
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

  it("writes staticwebapp.config.json with asset caching, root rewrite, and navigationFallback", async () => {
    await generateAzureSwaFiles({
      distDir: distUrl(),
      functionName: "server",
      projectRoot: projectRootUrl(),
    });

    expect(await readJson("client/staticwebapp.config.json")).toEqual({
      platform: {
        apiRuntime: "node:22",
      },
      routes: [
        {
          route: "/_astro/*",
          headers: {
            "cache-control": "public, max-age=31536000, immutable",
          },
        },
        {
          route: "/",
          rewrite: "/api/server",
        },
      ],
      navigationFallback: {
        rewrite: "/api/server",
        exclude: ["/_astro/*"],
      },
    });
  });

  it("allows overriding the API runtime from adapter options", async () => {
    await generateAzureSwaFiles({
      distDir: distUrl(),
      functionName: "server",
      projectRoot: projectRootUrl(),
      apiRuntime: "node:20",
    });

    expect(await readJson("client/staticwebapp.config.json")).toMatchObject({
      platform: {
        apiRuntime: "node:20",
      },
    });
  });

  it("allows setting the API runtime inside the Static Web Apps config", async () => {
    await generateAzureSwaFiles({
      distDir: distUrl(),
      functionName: "server",
      projectRoot: projectRootUrl(),
      staticWebAppConfig: {
        platform: {
          apiRuntime: "node:20",
        },
      },
    });

    expect(await readJson("client/staticwebapp.config.json")).toMatchObject({
      platform: {
        apiRuntime: "node:20",
      },
    });
  });

  it("merges custom Static Web Apps config from adapter options", async () => {
    await generateAzureSwaFiles({
      distDir: distUrl(),
      functionName: "server",
      projectRoot: projectRootUrl(),
      staticWebAppConfig: {
        globalHeaders: {
          "x-powered-by": "astro",
        },
        responseOverrides: {
          "404": {
            rewrite: "/404",
          },
        },
        routes: [
          {
            route: "/admin/*",
            allowedRoles: ["authenticated"],
          },
        ],
      },
    });

    expect(await readJson("client/staticwebapp.config.json")).toEqual({
      globalHeaders: {
        "x-powered-by": "astro",
      },
      responseOverrides: {
        "404": {
          rewrite: "/404",
        },
      },
      platform: {
        apiRuntime: "node:22",
      },
      routes: [
        {
          route: "/_astro/*",
          headers: {
            "cache-control": "public, max-age=31536000, immutable",
          },
        },
        {
          route: "/admin/*",
          allowedRoles: ["authenticated"],
        },
        {
          route: "/",
          rewrite: "/api/server",
        },
      ],
      navigationFallback: {
        rewrite: "/api/server",
        exclude: ["/_astro/*"],
      },
    });
  });

  it("suppresses generated / route and navigationFallback when user provides /*", async () => {
    await generateAzureSwaFiles({
      distDir: distUrl(),
      functionName: "server",
      projectRoot: projectRootUrl(),
      staticWebAppConfig: {
        routes: [
          {
            route: "/*",
            rewrite: "/maintenance.html",
          },
        ],
      },
    });

    expect(await readJson("client/staticwebapp.config.json")).toEqual({
      platform: {
        apiRuntime: "node:22",
      },
      routes: [
        {
          route: "/_astro/*",
          headers: {
            "cache-control": "public, max-age=31536000, immutable",
          },
        },
        {
          route: "/*",
          rewrite: "/maintenance.html",
        },
      ],
    });
  });

  it("writes api files beside client when Astro passes dist/client as dir", async () => {
    await mkdir(join(root, "dist", "client"), { recursive: true });

    await generateAzureSwaFiles({
      distDir: pathToFileURL(`${join(root, "dist", "client")}/`),
      functionName: "server",
      projectRoot: projectRootUrl(),
    });

    expect(await readJson("api/package.json")).toMatchObject({
      main: "server/index.mjs",
    });
    expect(await readJson("client/staticwebapp.config.json")).toMatchObject({
      platform: {
        apiRuntime: "node:22",
      },
      routes: expect.arrayContaining([
        {
          route: "/",
          rewrite: "/api/server",
        },
      ]),
      navigationFallback: {
        rewrite: "/api/server",
        exclude: ["/_astro/*"],
      },
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
      projectRoot: projectRootUrl(),
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
