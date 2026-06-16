# Roadmap

This package should stay focused on a native Astro 6 adapter for Azure Static Web Apps. The main design constraint is still: no Nitro, no H3, and no extra server runtime beyond Astro rendered through Azure Functions.

## Current Baseline

- Bun monorepo with the adapter package and a real Astro 6 example app.
- Azure Functions v4 wrapper using `@azure/functions`.
- Generated Static Web Apps output under `dist/client` and `dist/api`.
- Astro-native development: `astro dev`, `astro build`, and `astro preview` do not require users to start Azure Functions manually.
- Local SWA CLI verification for SSR pages, API routes, POST handlers, redirects, cookies, and 404s.
- GitHub Actions workflow that builds the package and deploys the example from generated output.
- Successful deployment: https://blue-wave-00d0bf30f.7.azurestaticapps.net/

## Recommended Next Changes

### 1. Preserve Astro-Native DX

Keep Azure Functions hidden from day-to-day user workflows.

Why:

- Astro users expect `astro dev`, `astro build`, and `astro preview` to work without host-specific services.
- Azure Functions is the deployment target, not the authoring model.
- The SWA CLI is useful for platform-fidelity validation, but it should remain optional.

Recommendation:

- Keep `astro dev` as pure Astro dev.
- Keep `astro build` responsible for generating all Azure output.
- Keep `astro preview` backed by the adapter preview entrypoint, not Azure Functions Core Tools.
- Add a separate optional command later for SWA CLI emulation if needed.

### 2. Emit an Explicit SWA API Runtime

Add `platform.apiRuntime` to the generated `staticwebapp.config.json`.

Recommended default:

```json
{
  "platform": {
    "apiRuntime": "node:20"
  }
}
```

Why:

- Azure Static Web Apps uses this setting to select the managed Functions runtime.
- Node 20 and Node 22 are the supported Node runtimes for managed SWA APIs.
- An explicit runtime reduces deployment drift between local builds, GitHub Actions, and Azure.

Recommendation:

- Default to `node:20`.
- Add an adapter option for `node:22` once local and CI coverage confirms it.
- Do not target Node 18 for new deployments.

### 3. Preserve Multiple `Set-Cookie` Headers

Update the response bridge to convert `Response` cookies into Azure Functions structured cookies.

Why:

- Flattening `set-cookie` into normal headers can lose multiple cookies or cookie attributes.
- Nitro's Azure preset handles this explicitly, and the same concern applies here.
- Auth, session, preview, and redirect flows commonly depend on exact cookie behavior.

Recommendation:

- Parse `response.headers.getSetCookie()` when available.
- Return cookies via the Azure Functions `cookies` response property.
- Omit `set-cookie` from the regular response headers after extracting cookies.
- Add tests for multiple cookies, `HttpOnly`, `Secure`, `SameSite`, `Path`, `Domain`, `Expires`, and `Max-Age`.

### 4. Keep Azure Functions v4

Do not downgrade to Nitro's `@azure/functions@^3.5.1` approach.

Why:

- Our current wrapper uses the v4 programming model through `app.http(...)`.
- The v4 model matches current Azure Functions guidance and avoids `function.json`-first structure.
- Keeping v4 gives us a cleaner generated output and less compatibility surface.

Recommendation:

- Keep `@azure/functions` on v4.
- Keep the generated wrapper separate from the Astro server bundle so Azure Functions internals are not bundled into Astro output.
- Keep testing for accidental `@azure/functions-core` leakage in generated server files.

### 5. Add Controlled SWA Config Extensibility

Add a small escape hatch for advanced `staticwebapp.config.json` settings.

Why:

- Users may need auth routes, global headers, response overrides, networking, or custom MIME types.
- The adapter should own the SSR rewrite and asset cache route, but should not block valid SWA configuration.

Recommendation:

- Start with narrow options:
  - `platformApiRuntime`
  - `staticWebAppConfig`
- Merge user config without allowing accidental removal of the required catch-all SSR rewrite unless explicitly requested.
- Document merge order and collision behavior.

### 6. Harden Deployment Workflow

Improve the generated GitHub Actions workflow once the package behavior stabilizes.

Why:

- Current deployment builds the package and example, then uploads generated output.
- The managed API build should install dependencies from `dist/api/package.json`.
- CI should fail before deployment if adapter tests or example builds regress.

Recommendation:

- Change the workflow build step to run `bun run check` before deploy.
- Keep `skip_app_build: true` because the Astro client output is already built.
- Avoid depending on npm publication for deployment; the example can continue consuming the workspace package during CI.
- Keep API runtime dependencies limited to `astro` and `@azure/functions`.

## Later Work

### Package Release Readiness

- Add package metadata: license, repository, homepage, bugs, and publish config.
- Add a changelog.
- Add release automation only after the API shape settles.
- Keep `astro` as a peer dependency and test against Astro 6 minor releases.

### More Example Coverage

Add examples for:

- Hybrid output.
- Static output with server routes.
- Middleware.
- Environment variables.
- Form actions.
- Auth-like cookie flows.

### Azure Validation

Add a reproducible validation path for real Azure deployments.

Recommended checks:

- GitHub Action deployment succeeds from a clean checkout.
- SSR route returns 200.
- Dynamic route returns 200.
- API route returns JSON.
- POST route receives body.
- Redirect preserves status and headers.
- Multiple cookies are preserved.
- Unknown route returns Astro's expected 404.

## Non-Goals

- Do not add Nitro or H3.
- Do not introduce a custom server framework.
- Do not publish generated API code that depends on the adapter package at runtime.
- Do not support Astro versions below 6.
- Do not add Azure infrastructure provisioning to the adapter package itself.
