# @opsydyn/astro-azure-swa

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
