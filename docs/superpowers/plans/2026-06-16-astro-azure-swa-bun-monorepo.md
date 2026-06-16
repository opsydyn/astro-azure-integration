# Astro Azure SWA Bun Monorepo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Bun workspace monorepo containing `@opsydyn/astro-azure-swa`, an Astro 6-only Azure Static Web Apps adapter, and a real Astro example app that consumes the local package.

**Architecture:** The adapter registers Astro 6's `entrypointResolution: "auto"` server entrypoint, then emits Azure Static Web Apps function app files after build. Runtime code stays thin: Azure Functions v4 receives HTTP requests, converts them to Web `Request`, calls Astro's `createApp().render()`, and converts the Web `Response` back to Azure's `HttpResponseInit`.

**Tech Stack:** Bun workspaces, Astro 6, TypeScript, Vitest, tsup, Azure Functions Node.js v4.

---

## File Structure

- Create `package.json`: root Bun workspace scripts and dev dependencies.
- Create `tsconfig.base.json`: shared TypeScript config.
- Create `vitest.config.ts`: root Vitest config.
- Create `README.md`: package positioning and basic usage.
- Create `packages/astro-azure-swa/package.json`: publishable adapter package metadata.
- Create `packages/astro-azure-swa/tsconfig.json`: package TypeScript config.
- Create `packages/astro-azure-swa/src/index.ts`: Astro integration and adapter registration.
- Create `packages/astro-azure-swa/src/server.ts`: Azure Functions v4 server entrypoint used by Astro.
- Create `packages/astro-azure-swa/src/bridge.ts`: Azure/Web request-response conversion.
- Create `packages/astro-azure-swa/src/generate.ts`: post-build file generator.
- Create `packages/astro-azure-swa/test/bridge.test.ts`: bridge unit tests.
- Create `packages/astro-azure-swa/test/generate.test.ts`: generated file unit tests.
- Create `examples/basic/package.json`: real workspace consumer app.
- Create `examples/basic/astro.config.ts`: Astro 6 app using the adapter.
- Create example pages/endpoints under `examples/basic/src`.
- Create `tests/basic-build.test.ts`: integration test that builds the example and inspects output.

## Environment Preflight

- [ ] **Step 1: Confirm Bun is available**

Run:

```bash
bun --version
```

Expected: prints a Bun version. If this command fails, install Bun or make it available on `PATH` before continuing. Do not rewrite the repo to npm or pnpm.

- [ ] **Step 2: Initialize git only if the directory is still not a repository**

Run:

```bash
git rev-parse --is-inside-work-tree
```

Expected if already initialized:

```txt
true
```

If it fails with `fatal: not a git repository`, run:

```bash
git init
git add handoff.md docs/superpowers/specs/2026-06-16-astro-azure-swa-bun-monorepo-design.md docs/superpowers/plans/2026-06-16-astro-azure-swa-bun-monorepo.md
git commit -m "docs: capture astro azure swa adapter plan"
```

## Task 1: Bootstrap Bun Workspace

**Files:**
- Create: `package.json`
- Create: `tsconfig.base.json`
- Create: `vitest.config.ts`
- Create: `README.md`

- [ ] **Step 1: Write workspace files**

Create `package.json`:

```json
{
  "name": "astro-azure-adapter",
  "private": true,
  "type": "module",
  "workspaces": [
    "packages/*",
    "examples/*"
  ],
  "scripts": {
    "build": "bun run --cwd packages/astro-azure-swa build",
    "typecheck": "bun run --cwd packages/astro-azure-swa typecheck",
    "test": "vitest run",
    "test:example": "bun run --cwd examples/basic build",
    "check": "bun run typecheck && bun run build && bun run test && bun run test:example"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "astro": "^6.0.0",
    "tsup": "^8.0.0",
    "typescript": "^5.9.0",
    "vitest": "^4.0.0"
  }
}
```

Create `tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["node"]
  }
}
```

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["packages/**/*.test.ts", "tests/**/*.test.ts"],
    testTimeout: 120_000,
  },
});
```

Create `README.md`:

```md
# @opsydyn/astro-azure-swa

A native Astro 6 adapter for Azure Static Web Apps.

No Nitro. No H3. No runtime wrapper.

Just Astro rendered through Azure Functions v4.

## Usage

```ts
import { defineConfig } from "astro/config";
import azureSwa from "@opsydyn/astro-azure-swa";

export default defineConfig({
  output: "server",
  adapter: azureSwa(),
});
```

## Local Development

```bash
bun install
bun run check
```
```

- [ ] **Step 2: Install dependencies**

Run:

```bash
bun install
```

Expected: `bun.lock` is created and dependencies install successfully.

- [ ] **Step 3: Run the empty test suite**

Run:

```bash
bun run test
```

Expected: Vitest starts and exits with no tests found or no matching test files. If Vitest exits non-zero because no tests exist, continue to Task 2 and use `bun run test packages/astro-azure-swa/test/bridge.test.ts` after adding the first test.

- [ ] **Step 4: Commit bootstrap**

Run:

```bash
git add package.json tsconfig.base.json vitest.config.ts README.md bun.lock
git commit -m "chore: bootstrap bun workspace"
```

## Task 2: Add Adapter Package Shell

**Files:**
- Create: `packages/astro-azure-swa/package.json`
- Create: `packages/astro-azure-swa/tsconfig.json`
- Create: `packages/astro-azure-swa/src/index.ts`
- Create: `packages/astro-azure-swa/src/server.ts`
- Create: `packages/astro-azure-swa/src/bridge.ts`
- Create: `packages/astro-azure-swa/src/generate.ts`

- [ ] **Step 1: Create package metadata**

Create `packages/astro-azure-swa/package.json`:

```json
{
  "name": "@opsydyn/astro-azure-swa",
  "version": "0.0.0",
  "description": "Native Astro 6 adapter for Azure Static Web Apps.",
  "type": "module",
  "files": ["dist"],
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    },
    "./server": {
      "types": "./dist/server.d.ts",
      "import": "./dist/server.js"
    },
    "./bridge": {
      "types": "./dist/bridge.d.ts",
      "import": "./dist/bridge.js"
    }
  },
  "keywords": ["astro", "astro-adapter", "azure", "static-web-apps"],
  "peerDependencies": {
    "astro": "^6.0.0"
  },
  "dependencies": {
    "@azure/functions": "^4.0.0"
  },
  "devDependencies": {
    "astro": "^6.0.0",
    "tsup": "^8.0.0",
    "typescript": "^5.9.0",
    "vitest": "^4.0.0"
  },
  "scripts": {
    "build": "tsup src/index.ts src/server.ts src/bridge.ts --format esm --dts --sourcemap --clean",
    "prepack": "bun run build",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run"
  }
}
```

Create `packages/astro-azure-swa/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": ".",
    "outDir": "dist"
  },
  "include": ["src/**/*.ts", "test/**/*.ts"]
}
```

- [ ] **Step 2: Add placeholder source files**

Create `packages/astro-azure-swa/src/bridge.ts`:

```ts
import type { HttpRequest, HttpResponseInit } from "@azure/functions";

export async function toWebRequest(request: HttpRequest): Promise<Request> {
  throw new Error(`toWebRequest is not implemented for ${request.method}`);
}

export async function toAzureResponse(
  response: Response,
): Promise<HttpResponseInit> {
  throw new Error(`toAzureResponse is not implemented for ${response.status}`);
}
```

Create `packages/astro-azure-swa/src/generate.ts`:

```ts
export interface GenerateAzureSwaFilesOptions {
  distDir: URL;
  functionName: string;
}

export async function generateAzureSwaFiles(
  options: GenerateAzureSwaFilesOptions,
): Promise<void> {
  throw new Error(
    `generateAzureSwaFiles is not implemented for ${options.functionName}`,
  );
}
```

Create `packages/astro-azure-swa/src/index.ts`:

```ts
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
```

Create `packages/astro-azure-swa/src/server.ts`:

```ts
import { app } from "@azure/functions";
import { createApp } from "astro/app/entrypoint";

import { toAzureResponse, toWebRequest } from "./bridge.js";

const astroApp = createApp();

app.http("server", {
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"],
  authLevel: "anonymous",
  route: "{*path}",
  handler: async (request) => {
    const webRequest = await toWebRequest(request);
    const response = await astroApp.render(webRequest);
    return toAzureResponse(response);
  },
});
```

- [ ] **Step 3: Typecheck the package shell**

Run:

```bash
bun run typecheck
```

Expected: TypeScript passes or surfaces exact Astro/Azure type errors. If `createApp().render()` has a different signature in installed Astro 6, inspect `node_modules/astro/dist/core/app/types.d.ts` and update only `src/server.ts` to match the installed type.

- [ ] **Step 4: Commit package shell**

Run:

```bash
git add packages/astro-azure-swa
git commit -m "chore: add adapter package shell"
```

## Task 3: Implement Request And Response Bridge With Tests

**Files:**
- Create: `packages/astro-azure-swa/test/bridge.test.ts`
- Modify: `packages/astro-azure-swa/src/bridge.ts`

- [ ] **Step 1: Write failing bridge tests**

Create `packages/astro-azure-swa/test/bridge.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { toAzureResponse, toWebRequest } from "../src/bridge.js";

interface FakeHttpRequest {
  url: string;
  method: string;
  headers: Headers;
  arrayBuffer: () => Promise<ArrayBuffer>;
}

function makeRequest(init: {
  url?: string;
  method?: string;
  headers?: HeadersInit;
  body?: string | Uint8Array;
}): FakeHttpRequest {
  const body =
    typeof init.body === "string"
      ? new TextEncoder().encode(init.body)
      : (init.body ?? new Uint8Array());

  return {
    url: init.url ?? "https://example.test/form?x=1",
    method: init.method ?? "GET",
    headers: new Headers(init.headers),
    arrayBuffer: async () => body.buffer.slice(0),
  };
}

describe("toWebRequest", () => {
  it("preserves URL, method, and headers", async () => {
    const request = await toWebRequest(
      makeRequest({
        method: "POST",
        headers: { "content-type": "text/plain", "x-test": "ok" },
        body: "hello",
      }) as never,
    );

    expect(request.url).toBe("https://example.test/form?x=1");
    expect(request.method).toBe("POST");
    expect(request.headers.get("content-type")).toBe("text/plain");
    expect(request.headers.get("x-test")).toBe("ok");
    await expect(request.text()).resolves.toBe("hello");
  });

  it("does not read bodies for GET requests", async () => {
    let read = false;
    const request = makeRequest({ method: "GET", body: "ignored" });
    request.arrayBuffer = async () => {
      read = true;
      return new ArrayBuffer(0);
    };

    const webRequest = await toWebRequest(request as never);

    expect(webRequest.method).toBe("GET");
    expect(read).toBe(false);
  });
});

describe("toAzureResponse", () => {
  it("preserves status, headers, and text body", async () => {
    const response = await toAzureResponse(
      new Response("created", {
        status: 201,
        headers: {
          location: "/created",
          "content-type": "text/plain",
        },
      }),
    );

    expect(response.status).toBe(201);
    expect(response.headers).toMatchObject({
      location: "/created",
      "content-type": "text/plain",
    });
    expect(new TextDecoder().decode(response.body as ArrayBuffer)).toBe(
      "created",
    );
  });

  it("preserves binary bodies", async () => {
    const bytes = new Uint8Array([0, 1, 2, 255]);
    const response = await toAzureResponse(
      new Response(bytes, {
        status: 200,
        headers: { "content-type": "application/octet-stream" },
      }),
    );

    expect([...new Uint8Array(response.body as ArrayBuffer)]).toEqual([
      0, 1, 2, 255,
    ]);
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
bun run test packages/astro-azure-swa/test/bridge.test.ts
```

Expected: tests fail with `toWebRequest is not implemented`.

- [ ] **Step 3: Implement bridge**

Replace `packages/astro-azure-swa/src/bridge.ts` with:

```ts
import type { HttpRequest, HttpResponseInit } from "@azure/functions";

const BODYLESS_METHODS = new Set(["GET", "HEAD"]);

export async function toWebRequest(request: HttpRequest): Promise<Request> {
  const method = request.method.toUpperCase();
  const headers = new Headers();

  for (const [key, value] of request.headers.entries()) {
    headers.set(key, value);
  }

  const body = BODYLESS_METHODS.has(method)
    ? undefined
    : await request.arrayBuffer();

  return new Request(request.url, {
    method,
    headers,
    body,
  });
}

export async function toAzureResponse(
  response: Response,
): Promise<HttpResponseInit> {
  const headers: Record<string, string> = {};

  response.headers.forEach((value, key) => {
    headers[key] = value;
  });

  return {
    status: response.status,
    headers,
    body: await response.arrayBuffer(),
  };
}
```

- [ ] **Step 4: Run bridge tests**

Run:

```bash
bun run test packages/astro-azure-swa/test/bridge.test.ts
```

Expected: all bridge tests pass.

- [ ] **Step 5: Commit bridge**

Run:

```bash
git add packages/astro-azure-swa/src/bridge.ts packages/astro-azure-swa/test/bridge.test.ts
git commit -m "test: cover azure request response bridge"
```

## Task 4: Generate Azure SWA Output Files

**Files:**
- Create: `packages/astro-azure-swa/test/generate.test.ts`
- Modify: `packages/astro-azure-swa/src/generate.ts`

- [ ] **Step 1: Write failing generator tests**

Create `packages/astro-azure-swa/test/generate.test.ts`:

```ts
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

  it("writes an Azure Functions v4 HTTP entrypoint", async () => {
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
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
bun run test packages/astro-azure-swa/test/generate.test.ts
```

Expected: tests fail with `generateAzureSwaFiles is not implemented`.

- [ ] **Step 3: Implement generator**

Replace `packages/astro-azure-swa/src/generate.ts` with:

```ts
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

export interface GenerateAzureSwaFilesOptions {
  distDir: URL;
  functionName: string;
}

const methods = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"];

export async function generateAzureSwaFiles({
  distDir,
  functionName,
}: GenerateAzureSwaFilesOptions): Promise<void> {
  const distPath = fileURLToPath(distDir);
  const apiPath = join(distPath, "api");
  const functionPath = join(apiPath, functionName);

  await mkdir(functionPath, { recursive: true });

  await writeJson(join(apiPath, "host.json"), {
    version: "2.0",
    extensions: {
      http: {
        routePrefix: "",
      },
    },
  });

  await writeJson(join(apiPath, "package.json"), {
    type: "module",
    main: `${functionName}/index.mjs`,
    dependencies: {
      "@azure/functions": "^4.0.0",
      "astro": "^6.0.0",
    },
  });

  await writeFile(
    join(functionPath, "index.mjs"),
    renderFunctionEntrypoint(functionName),
    "utf8",
  );

  await writeFile(join(functionPath, "bridge.mjs"), renderBridgeModule(), "utf8");

  await writeJson(join(distPath, "staticwebapp.config.json"), {
    navigationFallback: {
      rewrite: `/api/${functionName}`,
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
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(`${path}`, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function renderFunctionEntrypoint(functionName: string): string {
  return `import { app } from "@azure/functions";
import { createApp } from "astro/app/entrypoint";
import { toAzureResponse, toWebRequest } from "./bridge.mjs";

const astroApp = createApp();

app.http(${JSON.stringify(functionName)}, {
  methods: ${JSON.stringify(methods)},
  authLevel: "anonymous",
  route: "{*path}",
  handler: async (request) => {
    const webRequest = await toWebRequest(request);
    const response = await astroApp.render(webRequest);
    return toAzureResponse(response);
  },
});
`;
}

function renderBridgeModule(): string {
  return `const BODYLESS_METHODS = new Set(["GET", "HEAD"]);

export async function toWebRequest(request) {
  const method = request.method.toUpperCase();
  const headers = new Headers();

  for (const [key, value] of request.headers.entries()) {
    headers.set(key, value);
  }

  const body = BODYLESS_METHODS.has(method)
    ? undefined
    : await request.arrayBuffer();

  return new Request(request.url, {
    method,
    headers,
    body,
  });
}

export async function toAzureResponse(response) {
  const headers = {};

  response.headers.forEach((value, key) => {
    headers[key] = value;
  });

  return {
    status: response.status,
    headers,
    body: await response.arrayBuffer(),
  };
}
`;
}
```

- [ ] **Step 4: Run generator tests**

Run:

```bash
bun run test packages/astro-azure-swa/test/generate.test.ts
```

Expected: all generator tests pass.

- [ ] **Step 5: Commit generator**

Run:

```bash
git add packages/astro-azure-swa/src/generate.ts packages/astro-azure-swa/test/generate.test.ts
git commit -m "test: generate azure static web apps files"
```

## Task 5: Register Astro 6 Adapter

**Files:**
- Modify: `packages/astro-azure-swa/src/index.ts`

- [ ] **Step 1: Replace adapter integration**

Replace `packages/astro-azure-swa/src/index.ts` with:

```ts
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
          supportedAstroFeatures: {
            staticOutput: "stable",
            serverOutput: "stable",
            hybridOutput: "stable",
            sharpImageService: "stable",
            envGetSecret: "stable",
          },
          adapterFeatures: {
            buildOutput: "server",
            middlewareMode: "standalone",
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
```

- [ ] **Step 2: Typecheck adapter registration**

Run:

```bash
bun run typecheck
```

Expected: TypeScript passes. If Astro 6 type definitions reject `sharpImageService`, `envGetSecret`, or `middlewareMode`, inspect `node_modules/astro/dist/types/public/integrations.d.ts`, then remove only the rejected keys and keep `entrypointResolution: "auto"`, `serverEntrypoint`, `staticOutput`, `serverOutput`, `hybridOutput`, and `buildOutput`.

- [ ] **Step 3: Build the adapter package**

Run:

```bash
bun run build
```

Expected: `packages/astro-azure-swa/dist` contains `index.js`, `server.js`, `bridge.js`, and `.d.ts` files.

- [ ] **Step 4: Commit adapter registration**

Run:

```bash
git add packages/astro-azure-swa/src/index.ts packages/astro-azure-swa/package.json
git commit -m "feat: register astro 6 azure swa adapter"
```

## Task 6: Add Real Astro Example App

**Files:**
- Create: `examples/basic/package.json`
- Create: `examples/basic/astro.config.ts`
- Create: `examples/basic/src/pages/index.astro`
- Create: `examples/basic/src/pages/about.astro`
- Create: `examples/basic/src/pages/blog/[slug].astro`
- Create: `examples/basic/src/pages/api/health.ts`
- Create: `examples/basic/src/pages/form.ts`
- Create: `examples/basic/src/pages/redirect.ts`
- Create: `examples/basic/src/styles/global.css`

- [ ] **Step 1: Create example package and config**

Create `examples/basic/package.json`:

```json
{
  "name": "basic-astro-azure-swa-example",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "astro build",
    "dev": "astro dev",
    "preview": "astro preview"
  },
  "dependencies": {
    "@opsydyn/astro-azure-swa": "workspace:*",
    "astro": "^6.0.0"
  }
}
```

Create `examples/basic/astro.config.ts`:

```ts
import { defineConfig } from "astro/config";
import azureSwa from "@opsydyn/astro-azure-swa";

export default defineConfig({
  output: "server",
  adapter: azureSwa(),
});
```

- [ ] **Step 2: Create example pages**

Create `examples/basic/src/pages/index.astro`:

```astro
---
import "../styles/global.css";
const now = new Date().toISOString();
---

<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width" />
    <title>Azure SWA Astro Example</title>
  </head>
  <body>
    <main>
      <h1>Azure SWA Astro Example</h1>
      <p data-testid="render-time">Rendered at {now}</p>
      <nav>
        <a href="/about">About</a>
        <a href="/blog/hello">Blog</a>
        <a href="/api/health">Health</a>
      </nav>
    </main>
  </body>
</html>
```

Create `examples/basic/src/pages/about.astro`:

```astro
---
import "../styles/global.css";
---

<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width" />
    <title>About</title>
  </head>
  <body>
    <main>
      <h1>About</h1>
      <p>This page verifies a second SSR route.</p>
    </main>
  </body>
</html>
```

Create `examples/basic/src/pages/blog/[slug].astro`:

```astro
---
import "../../styles/global.css";

const { slug } = Astro.params;
---

<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width" />
    <title>Blog {slug}</title>
  </head>
  <body>
    <main>
      <h1>Blog: {slug}</h1>
      <p>This page verifies dynamic route params.</p>
    </main>
  </body>
</html>
```

Create `examples/basic/src/styles/global.css`:

```css
:root {
  color-scheme: light;
  font-family: Inter, system-ui, sans-serif;
}

body {
  margin: 0;
  background: #f7f7f8;
  color: #171717;
}

main {
  max-width: 48rem;
  margin: 4rem auto;
  padding: 0 1.5rem;
}

nav {
  display: flex;
  gap: 1rem;
}
```

- [ ] **Step 3: Create example endpoints**

Create `examples/basic/src/pages/api/health.ts`:

```ts
import type { APIRoute } from "astro";

export const GET: APIRoute = () => {
  return Response.json({
    ok: true,
    adapter: "@opsydyn/astro-azure-swa",
  });
};
```

Create `examples/basic/src/pages/form.ts`:

```ts
import type { APIRoute } from "astro";

export const POST: APIRoute = async ({ request }) => {
  const body = await request.text();

  return Response.json({
    method: request.method,
    body,
  });
};
```

Create `examples/basic/src/pages/redirect.ts`:

```ts
import type { APIRoute } from "astro";

export const GET: APIRoute = () => {
  return new Response(null, {
    status: 302,
    headers: {
      location: "/about",
      "set-cookie": "redirected=yes; Path=/; HttpOnly",
    },
  });
};
```

- [ ] **Step 4: Build the example app**

Run:

```bash
bun run test:example
```

Expected: Astro builds `examples/basic/dist` successfully and generated Azure SWA files are present.

- [ ] **Step 5: Commit example app**

Run:

```bash
git add examples/basic
git commit -m "test: add real astro adapter example"
```

## Task 7: Add Example Build Integration Test

**Files:**
- Create: `tests/basic-build.test.ts`

- [ ] **Step 1: Write failing integration test**

Create `tests/basic-build.test.ts`:

```ts
import { existsSync } from "node:fs";
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";

const exampleDir = join(process.cwd(), "examples/basic");
const distDir = join(exampleDir, "dist");

beforeEach(async () => {
  await rm(distDir, { recursive: true, force: true });
});

describe("basic Astro example build", () => {
  it("builds the app and emits Azure SWA files", async () => {
    const proc = Bun.spawn(["bun", "run", "build"], {
      cwd: exampleDir,
      stdout: "pipe",
      stderr: "pipe",
    });

    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);

    expect(
      exitCode,
      `stdout:\n${stdout}\n\nstderr:\n${stderr}`,
    ).toBe(0);

    expect(existsSync(join(distDir, "client"))).toBe(true);
    expect(existsSync(join(distDir, "api/host.json"))).toBe(true);
    expect(existsSync(join(distDir, "api/package.json"))).toBe(true);
    expect(existsSync(join(distDir, "api/server/index.mjs"))).toBe(true);
    expect(existsSync(join(distDir, "api/server/bridge.mjs"))).toBe(true);
    expect(existsSync(join(distDir, "staticwebapp.config.json"))).toBe(true);

    const config = JSON.parse(
      await readFile(join(distDir, "staticwebapp.config.json"), "utf8"),
    );

    expect(config.navigationFallback.rewrite).toBe("/api/server");
    expect(config.routes[0].route).toBe("/_astro/*");
  });
});
```

- [ ] **Step 2: Run integration test**

Run:

```bash
bun run test tests/basic-build.test.ts
```

Expected: the test passes if Task 6 already built correctly. If it fails because `Bun` is not typed in Vitest, add `"types": ["node", "bun-types"]` only after installing the Bun type package required by the installed Bun release.

- [ ] **Step 3: Run full check**

Run:

```bash
bun run check
```

Expected: typecheck, adapter build, unit tests, integration test, and example build all pass.

- [ ] **Step 4: Commit integration test**

Run:

```bash
git add tests/basic-build.test.ts
git commit -m "test: verify basic astro app build output"
```

## Task 8: Verify Azure SWA CLI Routing

**Files:**
- Modify: `packages/astro-azure-swa/src/generate.ts` only if the verified rewrite target differs.
- Modify: `packages/astro-azure-swa/test/generate.test.ts` only if the verified rewrite target differs.

- [ ] **Step 1: Install or run SWA CLI**

Run:

```bash
bunx @azure/static-web-apps-cli --version
```

Expected: prints a Static Web Apps CLI version.

- [ ] **Step 2: Build package and example**

Run:

```bash
bun run build
bun run test:example
```

Expected: both commands pass.

- [ ] **Step 3: Start local SWA emulator**

Run:

```bash
bunx @azure/static-web-apps-cli start ./examples/basic/dist/client --api-location ./examples/basic/dist/api
```

Expected: SWA CLI starts a local server and prints its URL, usually `http://localhost:4280`.

- [ ] **Step 4: Verify route behavior from another shell**

Run:

```bash
curl -i http://localhost:4280/
curl -i http://localhost:4280/about
curl -i http://localhost:4280/blog/hello
curl -i http://localhost:4280/api/health
curl -i -X POST http://localhost:4280/form --data 'name=astro'
curl -i http://localhost:4280/redirect
curl -i http://localhost:4280/not-found
```

Expected:

- `/` returns `200` HTML containing `Azure SWA Astro Example`.
- `/about` returns `200` HTML containing `About`.
- `/blog/hello` returns `200` HTML containing `Blog: hello`.
- `/api/health` returns `200` JSON containing `"ok":true`.
- `POST /form` returns `200` JSON containing `"body":"name=astro"`.
- `/redirect` returns `302`, `location: /about`, and the `set-cookie` header.
- `/not-found` returns Astro's 404 response.

- [ ] **Step 5: If deep routes fail, test alternate rewrites**

If `/about` or `/blog/hello` fails, change only the rewrite in `packages/astro-azure-swa/src/generate.ts` and matching assertion in `packages/astro-azure-swa/test/generate.test.ts`, then rerun Tasks 8.2 through 8.4.

First alternate:

```json
{
  "navigationFallback": {
    "rewrite": "/api/server/{*path}"
  }
}
```

Second alternate:

```json
{
  "routes": [
    {
      "route": "/_astro/*",
      "headers": {
        "cache-control": "public, max-age=31536000, immutable"
      }
    },
    {
      "route": "/*",
      "rewrite": "/api/server"
    }
  ]
}
```

- [ ] **Step 6: Commit verified routing**

Run:

```bash
git add packages/astro-azure-swa/src/generate.ts packages/astro-azure-swa/test/generate.test.ts
git commit -m "test: verify static web apps routing"
```

## Task 9: Final Verification And Documentation

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update README with verified commands**

Replace `README.md` with:

```md
# @opsydyn/astro-azure-swa

A native Astro 6 adapter for Azure Static Web Apps.

No Nitro. No H3. No runtime wrapper.

Just Astro rendered through Azure Functions v4.

## Install

```bash
bun add @opsydyn/astro-azure-swa
```

## Usage

```ts
import { defineConfig } from "astro/config";
import azureSwa from "@opsydyn/astro-azure-swa";

export default defineConfig({
  output: "server",
  adapter: azureSwa(),
});
```

## Local Development

```bash
bun install
bun run check
```

## Example

```bash
bun run test:example
bunx @azure/static-web-apps-cli start ./examples/basic/dist/client --api-location ./examples/basic/dist/api
```

## Generated Output

```txt
dist/
├── client/
├── api/
│   ├── host.json
│   ├── package.json
│   └── server/
│       ├── bridge.mjs
│       └── index.mjs
└── staticwebapp.config.json
```
```

- [ ] **Step 2: Run final check**

Run:

```bash
bun run check
```

Expected: all checks pass.

- [ ] **Step 3: Inspect git diff**

Run:

```bash
git status --short
git diff --stat
```

Expected: only intended implementation files are modified.

- [ ] **Step 4: Commit final docs**

Run:

```bash
git add README.md
git commit -m "docs: document astro azure swa adapter"
```

## Self-Review Checklist

- [ ] Every created source file has a matching task.
- [ ] Tests cover bridge conversion, generated files, and real Astro example build.
- [ ] Adapter uses Astro 6 `entrypointResolution: "auto"`.
- [ ] Runtime uses Azure Functions v4 `app.http(...)`.
- [ ] No Nitro, H3, Express, Fastify, Koa, or custom router is introduced.
- [ ] `host.json` and `package.json` are emitted under `dist/api`.
- [ ] SWA CLI route behavior is verified before claiming deploy readiness.
