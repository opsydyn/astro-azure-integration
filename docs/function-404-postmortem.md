# Post-Mortem: Azure Function 404 — Missing Runtime Dependencies

**Date:** 2026-06-16
**Scope:** End-to-end smoke testing of `@opsydyn/astro-azure-swa` on Azure Static Web Apps. Every request to a server-rendered route returned HTTP 404 with an empty body.

---

## Summary

The deployed Azure Function was silently crashing on startup because the adapter's generated `api/package.json` was missing `react` and `react-dom`. Astro externalises framework packages from its server bundle — they are not inlined into the built chunks — so the Azure Functions runtime could not resolve them when loading the server entry point.

Every deploy since the first successful CI run had been broken in exactly the same way. The bug was invisible until a smoke test was added to the deployment workflow. The smoke test also exposed an invalid workflow parameter (`skip_api_build`) that had been added as part of a separate investigation.

The site is now live and the `/api/health` endpoint returns 200:

https://blue-wave-00d0bf30f.7.azurestaticapps.net/api/health

---

## Issues

### 1. Generated `api/package.json` Missing Framework Runtime Dependencies

**What happened:** The adapter generates a minimal `api/package.json` that Oryx uses to install dependencies during SWA's managed function build. It listed only `@azure/functions` and `astro`. However, the Astro server bundle (built with `@astrojs/react`) contains:

```js
import React, { memo, createElement } from 'react';
import ReactDOM from 'react-dom/server';
```

These are static ESM imports in the built server chunk. They are not bundled by Astro because Astro/Vite treats `node_modules` packages as external in SSR mode. The Azure Functions runtime tried to resolve `react` and `react-dom` at startup, found nothing, and crashed. SWA returns an empty-body HTTP 404 for all managed function routes when the function process fails to start.

**Why it was hidden:** There was no smoke test in any previous CI run. The `Azure/static-web-apps-deploy@v1` action reports success once the zip is uploaded and accepted by SWA's control plane — it does not wait for the function runtime to start or validate that routes respond.

**Diagnosis:** The pattern that revealed the cause was eliminating layers:
- `/_astro/client.js` → HTTP 200 ✓ (CDN/static serving works)
- `/hybrid/` (prerendered page) → HTTP 404, empty body (function route, not working)
- `/api/server` (direct function call) → HTTP 404, empty body (function not starting)
- Read the built server chunk → found bare `import React from 'react'`
- Read `dist/api/package.json` → `react` absent

**Fix:** `generate.ts` now reads the project root's `package.json` in the `astro:build:done` hook and merges all non-workspace dependencies into the generated `api/package.json`. This ensures Oryx installs the project's framework packages (`react`, `react-dom`, etc.) server-side.

```ts
// src/generate.ts
const projectDeps = await readProjectDependencies(projectRoot);

await writeJson(join(apiPath, "package.json"), {
  type: "module",
  main: `${functionName}/index.mjs`,
  dependencies: {
    astro: "^6.0.0",
    ...projectDeps,           // react, react-dom, and any other project deps
    "@azure/functions": "^4.0.0",
  },
});
```

**Lesson:** For an Astro SSR adapter, the generated `package.json` must include all packages that Astro externalises in the server build — not just the packages the adapter itself imports. The safest strategy is to merge the full project `dependencies` rather than trying to predict which packages Astro will externalise.

---

### 2. `skip_api_build` Is Not a Declared Input of the SWA Deploy Action

**What happened:** During the investigation we added `skip_api_build: true` to the deploy step to prevent Oryx from re-running `npm install` over our pre-installed `node_modules`. GitHub Actions logged a warning:

```
Unexpected input(s) 'skip_api_build', valid inputs are [..., 'skip_app_build']
```

The action's `action.yml` does not declare this parameter. However, the underlying Docker container does read `INPUT_SKIP_API_BUILD` from the environment — so it worked, but only by accident. Relying on undeclared action inputs is fragile; a container image update could silently stop respecting it.

**Fix:** Removed `skip_api_build` from the workflow and removed the manual `npm install --omit=dev` pre-step. Oryx installs from the now-correct `api/package.json`.

**Lesson:** Only use inputs declared in an action's `action.yml`. Undeclared inputs that happen to work via env-var pass-through can disappear without notice in a patch release.

---

### 3. Uploading `node_modules` to SWA Is Unnecessary and Risky

**What happened:** To work around `skip_api_build` not being a real parameter, we pre-ran `npm install --omit=dev --prefix examples/basic/dist/api` in CI and uploaded the result. This added `package-lock.json` to the upload and put potentially-cross-platform `node_modules` (installed on the GitHub Actions Ubuntu runner) into a zip that SWA deploys onto its own Linux function host. It also added the risk of exceeding SWA's deployment size limits for large dependency trees (Astro's full production graph is substantial).

**Fix:** Removed the pre-install step. Oryx runs on the correct OS and installs the correct platform binaries server-side.

**Lesson:** Let SWA's Oryx build install API dependencies. Pre-installing `node_modules` and uploading them adds complexity and cross-platform risk without benefit when the correct packages are declared in `api/package.json`.

---

### 4. Smoke Test Added Too Late

**What happened:** The deployment workflow had no post-deploy health check until the `ci:` commit. Every prior successful run was "successful" in the sense that the deploy action exited 0 — but the function had never actually responded to an HTTP request. The 404 regression existed from the very first functional deploy.

**Fix:** The smoke test now checks `GET /api/health` with 12 retry attempts (120 seconds) after each deploy. The verify step also asserts that `"react"` is present in `api/package.json` to catch this class of missing-dependency bug locally before the deploy runs.

**Lesson:** For server-rendered apps, a post-deploy smoke test is essential. The deploy action's exit code only confirms the artifact was accepted by the SWA control plane — it does not confirm the runtime is operational. A 30-second investment in a health-check loop catches issues that could otherwise persist silently across many deploys.

---

## Sequence of Events

```
All previous deploys → deploy action exits 0
  (function crashing on startup, no smoke test)
     ↓
ci: commit adds smoke test
     ↓
Smoke test: /api/health → 404 (12 attempts, 2 min)
     ↓ (hypothesis: skip_api_build caused breakage)
Add npm install + skip_api_build → same 404
     ↓
Check static asset /_astro/* → HTTP 200 ✓
Check /hybrid/ → HTTP 404, empty body
Check /api/server → HTTP 404, empty body
     ↓ (function is crashing, not misbehaving)
Read server chunk → import React from 'react'
Read api/package.json → react missing
     ↓
generate.ts reads project package.json → merges deps
Remove skip_api_build, remove manual npm install
Push → Oryx installs react + react-dom
     ↓ ✅
/api/health → HTTP 200 {"ok":true}
```

---

## Mitigations for Next Time

| Risk | Mitigation |
|---|---|
| Framework packages missing from function at runtime | Merge project `dependencies` into generated `api/package.json` (now done) |
| Silent deploy success masking runtime failures | Smoke test after every deploy (now in CI) |
| Undeclared action inputs | Read the action's `action.yml` before adding an input; reject undeclared ones |
| Pre-installing node_modules for wrong platform | Let the server-side build tool (Oryx) install platform-native packages |
| Verify step not catching missing deps | Assert required packages exist in `api/package.json` before deploying (now in verify step) |
