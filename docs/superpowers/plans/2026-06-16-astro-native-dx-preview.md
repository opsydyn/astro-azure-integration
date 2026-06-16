# Astro-Native DX Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Azure Functions an implementation detail so users can rely on normal `astro dev`, `astro build`, and `astro preview` workflows.

**Architecture:** Keep `astro dev` untouched and pure Astro. Register a `previewEntrypoint` that starts a lightweight Node HTTP server for built output, serves static assets from `dist/client`, and forwards SSR requests to the built adapter server entry without requiring Azure Functions Core Tools or SWA CLI. Keep Azure-specific files generated only during `astro build`.

**Tech Stack:** Astro 6 adapter API, Bun, TypeScript, Vitest, Node `http` server, Web `Request`/`Response`.

---

### Task 1: Register Preview Support

**Files:**
- Modify: `packages/astro-azure-swa/src/index.ts`
- Modify: `packages/astro-azure-swa/package.json`
- Test: `packages/astro-azure-swa/test/integration.test.ts`

- [ ] **Step 1: Write the failing adapter metadata test**

Add a test that calls the integration's `astro:config:done` hook with a fake `setAdapter` callback and expects `previewEntrypoint` to be `@opsydyn/astro-azure-swa/preview`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun run test packages/astro-azure-swa/test/integration.test.ts`

Expected: FAIL because the adapter does not set `previewEntrypoint`.

- [ ] **Step 3: Add the preview entrypoint metadata**

Set `previewEntrypoint: "@opsydyn/astro-azure-swa/preview"` in `setAdapter()` and export `./preview` from the package.

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun run test packages/astro-azure-swa/test/integration.test.ts`

Expected: PASS.

### Task 2: Implement Preview Server

**Files:**
- Create: `packages/astro-azure-swa/src/preview.ts`
- Modify: `packages/astro-azure-swa/package.json`
- Test: `packages/astro-azure-swa/test/preview.test.ts`

- [ ] **Step 1: Write failing preview server tests**

Add tests that start the preview server with temporary `client` and `serverEntrypoint` files. Verify that static files are served from the client directory and SSR requests are forwarded to `handleAzureSwaRequest`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun run test packages/astro-azure-swa/test/preview.test.ts`

Expected: FAIL because `src/preview.ts` does not exist yet.

- [ ] **Step 3: Implement the minimal preview server**

Create a Node HTTP server that:

- Serves existing static files from `params.client`.
- Creates a fake Azure `HttpRequest` for SSR requests.
- Calls `handleAzureSwaRequest` from `params.serverEntrypoint`.
- Writes returned status, headers, cookies, and body to the Node response.
- Returns Astro's `PreviewServer` shape with `host`, `port`, `closed()`, and `stop()`.

- [ ] **Step 4: Run preview tests to verify they pass**

Run: `bun run test packages/astro-azure-swa/test/preview.test.ts`

Expected: PASS.

### Task 3: Document the DX Contract

**Files:**
- Modify: `README.md`
- Modify: `ROADMAP.md`
- Modify: `docs/deployment-postmortem.md`

- [ ] **Step 1: Update docs**

Document that users should run normal Astro commands and only use SWA CLI for optional platform-fidelity testing. Add the successful Azure deployment URL to the postmortem outcome.

- [ ] **Step 2: Verify docs are consistent**

Run: `sed -n '1,220p' README.md ROADMAP.md docs/deployment-postmortem.md`

Expected: Docs describe Azure Functions as build/deploy output, not a dev prerequisite.

### Task 4: Full Verification

**Files:**
- Verify all changed files.

- [ ] **Step 1: Run typecheck, package build, tests, and example build**

Run: `bun run check`

Expected: PASS.

- [ ] **Step 2: Manually verify example preview**

Run: `bun run --cwd examples/basic preview -- --host 127.0.0.1 --port 4322`, then request `/`, `/about`, `/api/health`, and `/form`.

Expected: Preview responds without starting Azure Functions or SWA CLI.

