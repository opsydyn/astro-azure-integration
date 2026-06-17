# @opsydyn/astro-azure-swa

A native Astro 6 adapter for Azure Static Web Apps.

No Nitro. No H3. No runtime wrapper. Just Astro's renderer and a thin bridge to Azure Functions v4 — the adapter handles routing config, hybrid pre-rendering, and the full deployment layout for SWA.

## Installation

```bash
npm install @opsydyn/astro-azure-swa
# or
bun add @opsydyn/astro-azure-swa
```

## Quick start

```ts
// astro.config.ts
import { defineConfig } from "astro/config";
import azureSwa from "@opsydyn/astro-azure-swa";

export default defineConfig({
  output: "server",
  adapter: azureSwa(),
});
```

Run `astro build` and deploy `dist/client` + `dist/api` to your SWA resource.

## Configuration

```ts
azureSwa({
  apiRuntime: "node:22",       // Azure Functions runtime (default: "node:22")
  functionName: "server",     // Function name (default: "server")
  staticWebAppConfig: { ... } // Merged into staticwebapp.config.json
})
```

### `staticWebAppConfig`

Any fields you provide are merged with the adapter's generated config. The adapter always generates:

- `/_astro/*` route with immutable cache headers
- A `navigationFallback` rewrite to the function for all unmatched paths
- An explicit `/` route to the function (overrides the SWA deploy placeholder)

```ts
azureSwa({
  staticWebAppConfig: {
    globalHeaders: {
      "x-powered-by": "astro",
    },
    routes: [
      {
        route: "/admin/*",
        allowedRoles: ["authenticated"],
      },
    ],
  },
})
```

If you provide a `/*` route, the adapter suppresses its generated `navigationFallback` and `/` route — your rule takes full control.

## Hybrid pre-rendering

Pages with `export const prerender = true` are built to `dist/client` and served directly from SWA's CDN. All other routes go through the Azure Function. No extra config needed.

```ts
// src/pages/about.astro
export const prerender = true;
```

The adapter uses `navigationFallback` (not a `/*` rewrite) so SWA checks for a static file before falling back to the function. Pre-rendered pages are served with zero function invocations.

## Generated output

```
dist/
├── client/
│   ├── _astro/         ← hashed assets, immutable CDN cache
│   ├── index.html      ← SWA deploy placeholder
│   └── staticwebapp.config.json
└── api/
    ├── host.json
    ├── package.json    ← includes your project's dependencies for Oryx
    └── server/
        ├── chunks/
        ├── entry.mjs
        └── index.mjs   ← Azure Functions v4 HTTP trigger
```

## Local development

Use normal Astro commands. The adapter only runs during `astro build` — no Azure tooling needed for everyday development.

```bash
astro dev     # standard dev server
astro build   # generates dist/client + dist/api
astro preview # previews the built output locally
```

For platform-fidelity testing with the SWA CLI:

```bash
astro build
cd dist/api && npm install && cd ../..
npx @azure/static-web-apps-cli start ./dist/client --api-location ./dist/api
```

## Supported Astro features

- SSR routes and API endpoints
- Hybrid pre-rendering (`prerender = true`)
- Middleware
- Astro Actions
- Server islands
- React (and other framework) client islands
- Environment variables
- Redirects and custom 404 pages

## Links

- [npm](https://www.npmjs.com/package/@opsydyn/astro-azure-swa)
- [GitHub](https://github.com/opsydyn/astro-azure-integration)
- [Example app](https://github.com/opsydyn/astro-azure-integration/tree/main/examples/basic)
- [Changelog](./CHANGELOG.md)
