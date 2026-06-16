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
│       ├── chunks/
│       └── index.mjs
└── staticwebapp.config.json
```
