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
  adapter: azureSwa({
    apiRuntime: "node:22",
  }),
});
```

The adapter defaults to `node:22` for Azure Static Web Apps managed APIs. You
can override the runtime or add other `staticwebapp.config.json` settings in
`astro.config.ts`:

```ts
export default defineConfig({
  output: "server",
  adapter: azureSwa({
    apiRuntime: "node:20",
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
  }),
});
```

`staticWebAppConfig` is merged into the generated config. The adapter always
adds the immutable `/_astro/*` asset cache route unless you define your own
route with the same path. It also appends the SSR catch-all rewrite as the final
route unless you explicitly provide your own `/*` route.

## Local Development

Use normal Astro commands. The adapter only generates Azure Static Web Apps
and Azure Functions files during `astro build`; you do not need to run Azure
Functions Core Tools or the SWA CLI for everyday development.

```bash
bun install
bun run --cwd examples/basic dev
```

From the repo root:

```bash
bun run dev
```

## Example

Build and preview the example with Astro:

```bash
bun run test:example
bun run --cwd examples/basic preview
```

For optional platform-fidelity testing with the Azure SWA CLI:

```bash
bun run test:example
cd examples/basic/dist/api && bun install && cd ../../..
bunx @azure/static-web-apps-cli start ./examples/basic/dist/client --api-location ./examples/basic/dist/api
```

## Generated Output

```txt
dist/
├── client/
│   ├── index.html
│   └── staticwebapp.config.json
├── api/
│   ├── host.json
│   ├── package.json
│   └── server/
│       ├── chunks/
│       └── index.mjs
└── server/
```

The Azure Function wrapper is generated output. User code continues to target
Astro pages, endpoints, middleware, and standard Astro commands.
