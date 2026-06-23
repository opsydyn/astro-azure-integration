# Astro 7 Advanced Routing + Elysia Demo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new `/api/edge/*` demo in `examples/basic` showing Astro 7's Advanced Routing (`src/fetch.ts`) running an Elysia app as the top-level request handler, with zero behavior change to any existing route.

**Architecture:** A new `src/fetch.ts` exports a dedicated Elysia instance scoped to the `/api/edge` prefix. Unmatched requests (everything outside that prefix) hit Elysia's `onError` for `NOT_FOUND` and fall through to `astro(new FetchState(request))` from `astro/fetch` — the same handler Astro uses with no `fetch.ts` present. This is purely additive; the existing nested `/api/elysia/[...slugs].ts` demo, `src/middleware.ts`, and the adapter package are untouched.

**Tech Stack:** Astro 7.0.0, Elysia ^1.4.29 (both already installed in `examples/basic` — no new dependencies). `astro/fetch` subpath export (`FetchState`, `astro`).

## Global Constraints

- Scope is `examples/basic` only. Do not modify `packages/astro-azure-swa` or `astro.config.ts`.
- New routes live under the `/api/edge` prefix exactly (not `/api/fetch` or any other name).
- Do not touch `src/middleware.ts`, `src/lib/elysia-app.ts`, or `src/pages/api/elysia/[...slugs].ts`.
- No new npm dependencies — `elysia` and `astro` are already in `examples/basic/package.json`.
- No global response headers or timing middleware — the demo only actively handles `/api/edge/*`; everything else must fall through unchanged.

---

## Task 1: Advanced Routing entry point (`src/fetch.ts`)

**Files:**
- Create: `examples/basic/src/fetch.ts`

**Interfaces:**
- Produces: a default-exported `Fetchable` (object with `.fetch(request): Promise<Response>`) at `examples/basic/src/fetch.ts`, picked up automatically by Astro's `vitePluginFetchable` (default `fetchFile` is `src/fetch`, already the case — no `astro.config.ts` change needed).
- Routes produced: `GET /api/edge` → `{ ok: true, handledBy: "src/fetch.ts (Astro 7 Advanced Routing)" }`; `GET /api/edge/greet/:name` → `{ greeting: "Hello, <name>! (handled at the edge, before Astro's router)" }`.

- [ ] **Step 1: Write `src/fetch.ts`**

```ts
import { Elysia } from "elysia";
import { FetchState, astro } from "astro/fetch";

export default new Elysia({ prefix: "/api/edge" })
  .onError(({ code, request }) => {
    if (code === "NOT_FOUND") {
      return astro(new FetchState(request));
    }
  })
  .get("/", () => ({
    ok: true,
    handledBy: "src/fetch.ts (Astro 7 Advanced Routing)",
  }))
  .get("/greet/:name", ({ params: { name } }) => ({
    greeting: `Hello, ${name}! (handled at the edge, before Astro's router)`,
  }));
```

- [ ] **Step 2: Typecheck**

Run: `bun run --cwd examples/basic typecheck`
Expected: exits 0, no errors mentioning `fetch.ts`.

- [ ] **Step 3: Start the dev server in the background**

Run: `bun run --cwd examples/basic dev`
This uses the `--background` flag already configured in `examples/basic/package.json`'s `dev` script. Wait for it to report the local URL (default `http://localhost:4321`) before continuing.

- [ ] **Step 4: Verify the new edge route**

Run: `curl -s http://localhost:4321/api/edge`
Expected: `{"ok":true,"handledBy":"src/fetch.ts (Astro 7 Advanced Routing)"}`

- [ ] **Step 5: Verify the param route**

Run: `curl -s http://localhost:4321/api/edge/greet/swa`
Expected: `{"greeting":"Hello, swa! (handled at the edge, before Astro's router)"}`

- [ ] **Step 6: Verify the edge route bypasses Astro middleware**

Run: `curl -sI http://localhost:4321/api/edge | grep -i x-astro-azure-demo`
Expected: no output (the header is absent — this route never reaches `src/middleware.ts`, proving it's handled before Astro's router runs).

- [ ] **Step 7: Verify existing routes are unaffected**

Run:
```bash
curl -sI http://localhost:4321/about | grep -i x-astro-azure-demo
curl -s http://localhost:4321/api/elysia
curl -s http://localhost:4321/api/elysia/greet/swa
```
Expected:
- `x-astro-azure-demo: middleware` header present for `/about` (unchanged from before this change).
- `/api/elysia` returns `{"ok":true,"runtime":"azure-functions-v4","adapter":"@opsydyn/astro-azure-swa"}` (unchanged).
- `/api/elysia/greet/swa` returns `{"greeting":"Hello, swa!"}` (unchanged).

- [ ] **Step 8: Stop the dev server**

Find and stop the background dev server process (e.g. via the harness's background-process controls, or `pkill -f "astro dev"` if run manually).

- [ ] **Step 9: Commit**

```bash
git add examples/basic/src/fetch.ts
git commit -m "feat(example): add Astro 7 Advanced Routing demo with Elysia"
```

---

## Task 2: Dashboard links + incidental version text fix (`src/pages/index.astro`)

**Files:**
- Modify: `examples/basic/src/pages/index.astro`

**Interfaces:**
- Consumes: the two routes produced in Task 1 (`/api/edge`, `/api/edge/greet/swa`).

- [ ] **Step 1: Add two entries to the `checks` array**

In `examples/basic/src/pages/index.astro`, find:

```ts
	["/api/elysia", "Elysia router"],
	["/api/elysia/greet/swa", "Elysia param route"],
	["/api/elysia/openapi", "Elysia OpenAPI (Scalar UI)"],
```

Replace with:

```ts
	["/api/elysia", "Elysia router"],
	["/api/elysia/greet/swa", "Elysia param route"],
	["/api/edge", "Astro 7 Advanced Routing (src/fetch.ts) + Elysia"],
	["/api/edge/greet/swa", "Advanced Routing param route"],
	["/api/elysia/openapi", "Elysia OpenAPI (Scalar UI)"],
```

- [ ] **Step 2: Fix stale "Astro 6" copy**

In the same file, find:

```html
      <p class="eyebrow">Astro 6 on Azure Static Web Apps</p>
```

Replace with:

```html
      <p class="eyebrow">Astro 7 on Azure Static Web Apps</p>
```

- [ ] **Step 3: Start the dev server in the background**

Run: `bun run --cwd examples/basic dev`
Wait for it to report the local URL before continuing.

- [ ] **Step 4: Verify the dashboard renders the new links and fixed copy**

Run: `curl -s http://localhost:4321/ | grep -E 'Astro 7 on Azure|/api/edge'`
Expected output contains three matches: the "Astro 7 on Azure Static Web Apps" eyebrow text, an `href="/api/edge"` anchor, and an `href="/api/edge/greet/swa"` anchor.

- [ ] **Step 5: Stop the dev server**

Stop the background dev server process started in Step 3.

- [ ] **Step 6: Commit**

```bash
git add examples/basic/src/pages/index.astro
git commit -m "feat(example): link Advanced Routing demo from dashboard"
```

---

## Task 3: README documentation (`README.md`)

**Files:**
- Modify: `examples/basic/README.md`

- [ ] **Step 1: Add a new section documenting the demo**

In `examples/basic/README.md`, after the existing introductory paragraph (the line starting `This example exercises...`), insert a new section:

```markdown

## Astro 7 Advanced Routing + Elysia

`src/fetch.ts` exports an Elysia app as the project's Advanced Routing entry
point (Astro 7's `Fetchable` convention). It handles `/api/edge/*` directly,
before Astro's own router runs, and falls through to `astro(new
FetchState(request))` for every other path — which is the same handler Astro
uses when no `src/fetch.ts` is present, so all other routes behave exactly as
they did before this file existed.

This is a different integration style from `src/pages/api/elysia/[...slugs].ts`,
which mounts Elysia *inside* an Astro endpoint (`/api/elysia/*`). The two
demos are kept side by side intentionally:

| Route | Integration style | Astro middleware runs? |
|---|---|---|
| `/api/elysia/*` | Elysia mounted inside an Astro API endpoint | Yes |
| `/api/edge/*` | Elysia as the top-level `src/fetch.ts` handler | No — handled before Astro's router |
```

- [ ] **Step 2: Verify the section was inserted correctly**

Run: `grep -A2 "## Astro 7 Advanced Routing" examples/basic/README.md`
Expected: prints the new heading followed by its first two lines of body text.

- [ ] **Step 3: Commit**

```bash
git add examples/basic/README.md
git commit -m "docs(example): document the Advanced Routing + Elysia demo"
```
