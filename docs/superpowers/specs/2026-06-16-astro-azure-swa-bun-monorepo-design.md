# Astro Azure SWA Bun Monorepo Design

## Goal

Build `@opsydyn/astro-azure-swa`, a native Astro 6 adapter for Azure Static Web Apps that runs SSR and hybrid Astro apps through Azure Functions v4 without Nitro, H3, Express, Fastify, or a custom routing runtime.

## Scope

Phase 1 creates a Bun workspace monorepo with:

- `packages/astro-azure-swa`: the adapter package.
- `examples/basic`: a real Astro 6 app that consumes the local adapter package.
- `tests`: package-level unit tests and fixture-oriented integration tests.

The adapter must support Astro `output: "server"`, `output: "hybrid"`, and `output: "static"` where Astro supports those modes through the adapter API.

## Fixed Decisions

- Target Astro 6 only.
- Use Bun as the package manager and workspace runner.
- Use TypeScript for package source.
- Use Vitest for unit and integration tests.
- Use Azure Functions Node.js v4's code-centric programming model with `app.http(...)`.
- Use Astro 6 adapter API with `entrypointResolution: "auto"`.
- Use `createApp()` from `astro/app/entrypoint` in the server entrypoint.
- Keep the runtime bridge thin: Azure Functions request in, standard `Request` to Astro, standard `Response` back to Azure Functions.

## Repository Layout

```txt
astro-azure-adapter/
├── package.json
├── bun.lock
├── tsconfig.base.json
├── vitest.config.ts
├── README.md
├── handoff.md
├── packages/
│   └── astro-azure-swa/
│       ├── package.json
│       ├── tsconfig.json
│       ├── src/
│       │   ├── index.ts
│       │   ├── server.ts
│       │   ├── bridge.ts
│       │   └── generate.ts
│       └── test/
│           ├── bridge.test.ts
│           └── generate.test.ts
├── examples/
│   └── basic/
│       ├── package.json
│       ├── astro.config.ts
│       └── src/
│           ├── pages/
│           │   ├── index.astro
│           │   ├── about.astro
│           │   ├── blog/
│           │   │   └── [slug].astro
│           │   ├── form.ts
│           │   ├── redirect.ts
│           │   └── api/
│           │       └── health.ts
│           └── styles/
│               └── global.css
└── tests/
    └── basic-build.test.ts
```

## Package Shape

The root `package.json` owns workspace scripts:

- `bun run build`: builds the adapter package.
- `bun run test`: runs Vitest.
- `bun run test:example`: builds the example app using the local adapter.
- `bun run check`: runs typecheck, build, and tests.

The adapter package publishes ESM only:

- `exports["."]` points to the adapter integration.
- `exports["./server"]` points to the Azure Functions server entrypoint used by Astro.
- `peerDependencies.astro` is `^6.0.0`.
- `dependencies["@azure/functions"]` is the runtime Azure Functions dependency.

## Adapter Registration

`src/index.ts` exports the default adapter integration:

- In `astro:config:done`, call `setAdapter()`.
- Set `name` to `@opsydyn/astro-azure-swa`.
- Set `entrypointResolution` to `"auto"`.
- Set `serverEntrypoint` to `@opsydyn/astro-azure-swa/server`.
- Advertise Astro feature support conservatively.
- In `astro:build:done`, generate Azure SWA function app files into the build output.

The adapter options are intentionally small:

```ts
export interface AzureSwaAdapterOptions {
  functionName?: string;
}
```

Default `functionName` is `"server"`.

## Generated Output

The adapter should produce this shape after an Astro build:

```txt
dist/
├── client/
│   └── _astro/
├── api/
│   ├── host.json
│   ├── package.json
│   └── server/
│       └── index.mjs
└── staticwebapp.config.json
```

Important correction from the handoff: `host.json` and `package.json` belong at the Azure Functions app root, `dist/api`, not inside `dist/api/server`.

The generated Azure function entrypoint should use the v4 model:

```ts
import { app } from "@azure/functions";
import { createApp } from "astro/app/entrypoint";
import { toAzureResponse, toWebRequest } from "@opsydyn/astro-azure-swa/bridge";

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

This exact import shape may need adjustment based on Astro's bundled server output. The first integration spike must verify the generated `dist/server` output and how Astro resolves `@opsydyn/astro-azure-swa/server` with `entrypointResolution: "auto"`.

## Request And Response Bridge

`src/bridge.ts` converts between Azure Functions v4 HTTP types and Web Platform types:

- Preserve request URL, method, and headers.
- Read request bodies for all methods except `GET` and `HEAD`.
- Return response status, headers, and body.
- Add explicit tests for POST bodies, redirects, binary responses, and cookies.

Known edge cases:

- Multiple `Set-Cookie` values cannot be safely represented by a plain object in every runtime.
- Streaming responses may require returning a stream-compatible body instead of eagerly buffering.
- Azure Functions response header casing and repeated header semantics must be verified with real runtime tests.

Phase 1 can buffer bodies. Streaming can remain a documented limitation until a failing test proves the required shape.

## Static Web Apps Routing

`staticwebapp.config.json` must:

- Allow static assets under `/_astro/*` to be served directly with immutable cache headers.
- Route unknown navigation requests to the Azure Function.
- Preserve API endpoint behavior for Astro endpoints such as `/api/health`.

The fallback rewrite is not assumed. The implementation plan must test at least these candidates with the example app and SWA CLI:

- `"/api/server"`
- `"/api/server/{*path}"`
- A route rule using `rewrite` for `"/*"`.

The chosen config must be the smallest config that passes deep routes, static assets, Astro endpoints, and 404 behavior.

## Example App

`examples/basic` is not a fake fixture. It is a real Astro app that depends on the workspace package:

```json
{
  "dependencies": {
    "@opsydyn/astro-azure-swa": "workspace:*",
    "astro": "^6.0.0"
  }
}
```

It should include:

- `/`: SSR page.
- `/about`: SSR page.
- `/blog/[slug]`: dynamic route.
- `/api/health`: endpoint returning JSON.
- `/form`: endpoint that reads POST body.
- `/redirect`: endpoint that returns a redirect.
- A stylesheet or asset that produces `/_astro/*` output.

## Testing Strategy

Unit tests:

- `bridge.test.ts`: request conversion, body handling, response conversion, redirect headers, binary body preservation.
- `generate.test.ts`: emitted file paths and JSON content.

Integration tests:

- Build `examples/basic` using the local adapter.
- Assert expected files exist under `examples/basic/dist`.
- Inspect generated `dist/api` files.
- Start with static file and function emulation only after Bun, Node, and SWA CLI are available locally.

The first implementation milestone should stop at `bun run check` plus an example Astro build. SWA CLI runtime verification is a separate milestone because this environment currently lacks Bun, Node, npm, and pnpm.

## Non-Goals

Do not add:

- Nitro
- H3
- Express
- Fastify
- Koa
- A custom router
- Multi-function per-route output
- Edge middleware support
- Streaming support before a failing runtime test exists

## Open Questions To Resolve During Implementation

1. Exact Astro 6 `supportedAstroFeatures` and `adapterFeatures` property names accepted by the installed type definitions.
2. Whether the generated server entrypoint should import `createApp()` directly or whether Astro rewrites the entrypoint during build.
3. Azure Functions v4 repeated header support for `Set-Cookie`.
4. Correct SWA fallback rewrite target for deep SSR routes.
5. Whether Azure Static Web Apps managed functions respect `host.json` `extensions.http.routePrefix = ""`.
6. Whether the adapter package needs to copy runtime files into `dist/api/server` or whether Astro emits a self-contained function bundle that can be moved.

## Sources Checked

- Astro Adapter API, including `entrypointResolution: "auto"` and Astro 6 server entrypoint guidance.
- Astro 6 upgrade guide, including replacing `loadApp()` with `createApp()`.
- Azure Functions Node.js v4 guidance for code-centric HTTP functions.
- Azure Static Web Apps configuration guidance for `navigationFallback` and route rewrites.
