# High-Fidelity Example App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand `examples/basic` into a high-fidelity Astro 6 + Azure SWA adapter demo that exercises SSR, dynamic routes, hybrid/static output, middleware, environment access, forms, redirects, multiple cookies, and auth-like cookie flows.

**Architecture:** Keep one canonical sample app under `examples/basic`. Add focused routes and middleware that each prove one adapter behavior, then extend the root integration test to build and preview the app locally through `astro preview` without Azure Functions Core Tools.

**Tech Stack:** Astro 6, Bun, Vitest, adapter preview entrypoint, Node child processes, Web `fetch`.

---

### Task 1: Add Preview Validation Tests

**Files:**
- Modify: `tests/basic-build.test.ts`

- [ ] Write failing tests that build the example, start `astro preview`, and fetch `/`, `/server`, `/hybrid`, `/middleware`, `/env`, `/api/health`, `/api/echo`, `/form`, `/redirect`, `/cookies`, `/auth`, `/auth/check`, `/blog/hello`, and `/not-found`.
- [ ] Verify the tests fail because the new routes do not exist yet.

### Task 2: Add Demo Routes and Middleware

**Files:**
- Create: `examples/basic/src/middleware.ts`
- Create: `examples/basic/src/pages/server.astro`
- Create: `examples/basic/src/pages/hybrid.astro`
- Create: `examples/basic/src/pages/middleware.astro`
- Create: `examples/basic/src/pages/env.astro`
- Create: `examples/basic/src/pages/api/echo.ts`
- Create: `examples/basic/src/pages/cookies.ts`
- Create: `examples/basic/src/pages/auth.ts`
- Create: `examples/basic/src/pages/auth/check.ts`
- Modify: `examples/basic/src/pages/index.astro`
- Modify: `examples/basic/src/pages/form.ts`
- Modify: `examples/basic/src/styles/global.css`

- [ ] Implement the routes with clear response markers so validation is deterministic.
- [ ] Keep the UI compact and useful for a demo, with links to every route.

### Task 3: Verify and Document

**Files:**
- Modify: `README.md`
- Modify: `ROADMAP.md`

- [ ] Document that the sample app now covers the Azure validation checklist.
- [ ] Run `bun run check` and confirm typecheck, build, tests, and example build pass.

