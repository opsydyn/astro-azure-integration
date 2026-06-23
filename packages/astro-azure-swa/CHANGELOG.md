# @opsydyn/astro-azure-swa

## 1.0.0

### Major Changes

- 392351b: Require Astro 7. Drops support for Astro 6.

  The adapter's request path (`createApp()` → `astro/app/entrypoint` → `App.render()`) is unchanged and requires no code changes for Astro 7 — this release only raises the `astro` peer dependency floor to `^7.0.0` and re-verifies the full test suite, build, and example app against it. Astro 7's new Advanced Routing (`src/fetch.ts`) and `astro/fetch` API are fully usable with this adapter with no special integration required.

## 0.1.1

### Patch Changes

- 89a1164: Add package README with installation, configuration, hybrid pre-rendering, generated output, and local dev documentation.

## 0.1.0

### Minor Changes

- 978288b: Initial release of the native Astro 6 adapter for Azure Static Web Apps.

  No Nitro. No H3. No runtime wrapper. Astro's renderer runs directly inside an Azure Functions v4 HTTP trigger, with the adapter generating all routing config, hybrid pre-rendering layout, and deployment artifacts automatically.

  Features:

  - Full SSR via Azure Functions v4
  - Hybrid pre-rendering: static pages served from CDN, dynamic routes via the function
  - `navigationFallback` routing for correct hybrid behaviour on SWA
  - Automatic `staticwebapp.config.json` generation with immutable asset cache headers
  - Merges project `dependencies` into the generated `api/package.json` so Oryx installs all required modules at deploy time
  - Supports Astro Actions, server islands, middleware, and all standard Astro features
  - Configurable `apiRuntime`, `functionName`, and full `staticWebAppConfig` passthrough
