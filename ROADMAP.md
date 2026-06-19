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
- Controlled SWA config extensibility through adapter-level `apiRuntime` and `staticWebAppConfig` options.
- High-fidelity example app covering SSR, dynamic routes, hybrid prerendering, middleware, environment variables, API routes, POST handlers, Astro Actions, React client islands, server islands, redirects, multiple cookies, auth-like cookie flows, and Astro 404s.
- Local preview validation for the same route set through `astro preview`.

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

Generated default:

```json
{
  "platform": {
    "apiRuntime": "node:22"
  }
}
```

Why:

- Azure Static Web Apps uses this setting to select the managed Functions runtime.
- Node 20 and Node 22 are the supported Node runtimes for managed SWA APIs.
- An explicit runtime reduces deployment drift between local builds, GitHub Actions, and Azure.

Recommendation:

- Default to `node:22`.
- Keep `node:20` as an adapter-level override for projects that need the older supported LTS runtime.
- Allow additional `staticwebapp.config.json` settings through `staticWebAppConfig` in `astro.config.ts`.
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

### 5. Harden Deployment Workflow

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

### Example App: Elysia Integration Showcase

Make the Elysia + Astro + Azure Functions integration in the example app demonstrate more than route wiring.

Why:

- The example currently proves Elysia routes work behind the adapter, but every demo route is a static JSON response. Nothing shows the API and an Astro island talking to each other live.
- The adapter's value is that a real API framework runs unmodified behind Azure Functions; an island that calls it and updates in the browser proves the round trip end-to-end, not just curl-ability.

Recommendation, in order:

1. ~~**Eden type-safe client island.**~~ Done. `EdenGreeter.tsx` calls the Elysia app through `@elysiajs/eden`'s treaty client, with request state managed by `effect`'s `Atom`/`AsyncResult.builder` instead of `useState`. Request/response types are inferred directly from the server route definitions, no manual typing or codegen step.
2. **Fast follow — live request-stats dashboard island.** Add a small in-memory counter middleware to the Elysia app (requests by route, response times), expose it at `/api/elysia/stats`, and poll it from a client island to animate live numbers. Demonstrates that server state survives across invocations within a warm Function instance.
3. CRUD island backed by Elysia (create/read/update/delete against an in-memory or Azure Table Storage-backed list), to show the full request lifecycle beyond GET.
4. SSE/streaming demo (stretch, adapter-level work, not just example work). The response bridge currently buffers the whole body via `response.arrayBuffer()` before handing it to Azure Functions, so true streaming needs `bridge.ts` changed to pipe `response.body` instead. Worth doing only as a deliberate adapter feature addition, since it touches the core response path, not the example.

**Incidental fix, found while building item 1**: Elysia's default 404 path shares one singleton `Response` object per compiled handler and clones it per-request with no concurrency guard. Concurrent requests to any unmatched route race on the same underlying stream and corrupt it (`Response.clone: Body has already been consumed`), 500ing every unmatched request after the first collision for the life of the process. Fixed in `elysia-app.ts` by registering an `onError` handler for `NOT_FOUND`, which routes 404s through `app.handleError` instead of the buggy shared-singleton path. Verified with 150 concurrent requests to unmatched routes, zero errors.

## Non-Goals

- Do not add Nitro or H3.
- Do not introduce a custom server framework.
- Do not publish generated API code that depends on the adapter package at runtime.
- Do not support Astro versions below 6.
- Do not add Azure infrastructure provisioning to the adapter package itself.
