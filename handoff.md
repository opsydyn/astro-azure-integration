# codex handoff: `@opsydyn/astro-azure-swa`

build a native Astro adapter for Azure Static Web Apps.

## goal

create an npm package:

```txt
@opsydyn/astro-azure-swa
```

that lets an Astro app run SSR / hybrid output on Azure Static Web Apps using Azure Functions v4.

no Nitro. no H3. no extra runtime layer.

## core idea

```txt
Azure Static Web Apps
  ↓
Azure Function catch-all
  ↓
Web Request
  ↓
AstroApp.render(request)
  ↓
Web Response
  ↓
Azure Function Response
```

## principle

use the least powerful abstraction that solves the problem.

Astro already owns rendering.
Azure Functions only needs to host the server entry.
The adapter only bridges the two.

---

# phase 1 scope

support:

```txt
output: "server"
output: "hybrid"
output: "static"
```

emit:

```txt
dist/
├── client/
│   └── _astro/
├── api/
│   └── server/
│       ├── function.json
│       ├── index.mjs
│       ├── host.json
│       └── package.json
└── staticwebapp.config.json
```

---

# dependencies

adapter package:

```bash
pnpm add @azure/functions
pnpm add -D astro typescript tsup vitest @types/node
```

`astro` should be a peer dependency.

```json
{
  "peerDependencies": {
    "astro": "^5.0.0"
  },
  "dependencies": {
    "@azure/functions": "^4.0.0"
  }
}
```

---

# adapter entry

create:

```txt
packages/astro-azure-swa/src/index.ts
```

rough shape:

```ts
import type { AstroIntegration } from "astro";

export interface AzureSwaAdapterOptions {
  functionName?: string;
}

export default function azureSwaAdapter(
  options: AzureSwaAdapterOptions = {},
): AstroIntegration {
  const functionName = options.functionName ?? "server";

  return {
    name: "@opsydyn/astro-azure-swa",
    hooks: {
      "astro:config:done": ({ setAdapter }) => {
        setAdapter({
          name: "@opsydyn/astro-azure-swa",
          serverEntrypoint: "@opsydyn/astro-azure-swa/server",
          supportedAstroFeatures: {
            staticOutput: "stable",
            serverOutput: "stable",
            hybridOutput: "stable",
            assets: {
              supportKind: "stable",
              isSharpCompatible: true,
              isSquooshCompatible: true
            }
          },
          adapterFeatures: {
            edgeMiddleware: false,
            buildOutput: "server",
            functionPerRoute: false
          }
        });
      },

      "astro:build:done": async ({ dir }) => {
        // generate Azure SWA files here
      }
    }
  };
}
```

adjust types to match installed Astro version.

---

# server entry

create:

```txt
packages/astro-azure-swa/src/server.ts
```

target generated Azure Function:

```ts
import { app } from "@azure/functions";
import { App } from "astro/app";

import { manifest } from "./manifest.js";

const astroApp = new App(manifest);

app.http("server", {
  methods: [
    "GET",
    "POST",
    "PUT",
    "PATCH",
    "DELETE",
    "OPTIONS",
    "HEAD"
  ],
  authLevel: "anonymous",
  route: "{*path}",
  handler: async (request) => {
    const webRequest = toWebRequest(request);
    const response = await astroApp.render(webRequest);
    return toAzureResponse(response);
  }
});
```

---

# bridge functions

create:

```txt
packages/astro-azure-swa/src/bridge.ts
```

implement:

```ts
import type {
  HttpRequest,
  HttpResponseInit
} from "@azure/functions";

export async function toWebRequest(request: HttpRequest): Promise<Request> {
  const url = request.url;

  const headers = new Headers();

  for (const [key, value] of request.headers.entries()) {
    headers.set(key, value);
  }

  const method = request.method.toUpperCase();

  const hasBody = !["GET", "HEAD"].includes(method);

  const body = hasBody
    ? await request.arrayBuffer()
    : undefined;

  return new Request(url, {
    method,
    headers,
    body
  });
}

export async function toAzureResponse(
  response: Response
): Promise<HttpResponseInit> {
  const headers: Record<string, string> = {};

  response.headers.forEach((value, key) => {
    headers[key] = value;
  });

  const body = await response.arrayBuffer();

  return {
    status: response.status,
    headers,
    body
  };
}
```

watch out for:

```txt
set-cookie
streaming
binary bodies
redirects
```

phase 1 can be simple; add tests.

---

# generated files

## `function.json`

```json
{
  "bindings": [
    {
      "authLevel": "anonymous",
      "type": "httpTrigger",
      "direction": "in",
      "name": "req",
      "methods": [
        "get",
        "post",
        "put",
        "patch",
        "delete",
        "options",
        "head"
      ],
      "route": "{*path}"
    },
    {
      "type": "http",
      "direction": "out",
      "name": "$return"
    }
  ]
}
```

## `host.json`

```json
{
  "version": "2.0",
  "extensions": {
    "http": {
      "routePrefix": ""
    }
  }
}
```

## `api/package.json`

```json
{
  "type": "module",
  "dependencies": {
    "@azure/functions": "^4.0.0"
  }
}
```

## `staticwebapp.config.json`

```json
{
  "navigationFallback": {
    "rewrite": "/api/server"
  },
  "routes": [
    {
      "route": "/_astro/*",
      "headers": {
        "cache-control": "public, max-age=31536000, immutable"
      }
    }
  ]
}
```

validate whether SWA needs rewrite to `/api/server` or `/api/server/{*path}`.

---

# example usage

in a test Astro app:

```ts
import { defineConfig } from "astro/config";
import azureSwa from "@opsydyn/astro-azure-swa";

export default defineConfig({
  output: "server",
  adapter: azureSwa()
});
```

local preview:

```bash
pnpm astro build

npx @azure/static-web-apps-cli start ./dist/client \
  --api-location ./dist/api
```

---

# acceptance tests

create fixture app with:

```txt
/
 /about
 /blog/[slug]
 /api/health
 /redirect
 /form POST
```

test:

```txt
GET / returns HTML
GET /about returns HTML
GET /blog/hello handles params
GET /_astro/* serves static directly
GET /api/health works
POST /form body is readable
cookies survive
redirects survive
404 works
```

---

# nice repo shape

```txt
astro-azure-swa/
├── packages/
│   └── astro-azure-swa/
│       ├── src/
│       │   ├── index.ts
│       │   ├── server.ts
│       │   ├── bridge.ts
│       │   └── generate.ts
│       ├── package.json
│       └── tsconfig.json
├── examples/
│   └── basic/
│       ├── src/
│       ├── astro.config.ts
│       └── package.json
├── tests/
│   └── adapter.test.ts
├── pnpm-workspace.yaml
└── README.md
```

---

# readme positioning

```md
# @opsydyn/astro-azure-swa

A native Astro adapter for Azure Static Web Apps.

No Nitro.
No H3.
No runtime wrapper.

Just Astro rendered through Azure Functions.
```

## why?

```txt
Nitro proves Azure SWA can host full-stack apps.
Astro already provides the rendering model.
This adapter only bridges Azure Functions to Astro's Request/Response runtime.
```

---

# non-goals

do not add:

```txt
nitropack
h3
express
fastify
koa
custom router
```

unless a test proves they are required.

---

# open questions

1. exact Astro v5 adapter types
2. correct manifest import shape
3. Azure Functions v4 ESM handler output shape
4. SWA rewrite behaviour for deep routes
5. whether `routePrefix: ""` is allowed in SWA managed functions
6. streaming response support
7. multiple `set-cookie` headers

---

# first task

make the smallest working spike:

```txt
pnpm create astro example
add adapter
build
run SWA CLI
GET /
GET /about
```

only after that, harden the bridge.
