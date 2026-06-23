# Astro 7 Advanced Routing + Elysia Demo

**Date:** 2026-06-23
**Scope:** `examples/basic` only. No changes to `packages/astro-azure-swa`.

## Background

Astro 7 introduces "Advanced Routing": a `src/fetch.ts` entry point that exports
a `Fetchable` (`{ fetch(request): Response | Promise<Response> }`). When present,
this object runs *before* Astro's own router on every request. Unmatched
requests fall through to Astro's normal pipeline via `astro(new
FetchState(request))` from `astro/fetch`.

Elysia instances already satisfy `Fetchable` (`app.fetch` exists; `app.handle`
is an alias for it), so an Elysia app can be dropped in directly as the
project's `src/fetch.ts` default export — the pattern shown in the Astro 7
blog post and Elysia's own examples.

Traced through `astro` 7.0.0's source: the Azure adapter's request path
(`createApp()` → `astro/app/entrypoint` → `App.render()`) already imports
`virtual:astro:fetchable` and dispatches through it unconditionally. The
adapter requires zero changes to support this. `astro(state)` is backed by
the same `AstroHandler` class used when no `fetch.ts` exists, so any request
that falls through behaves identically to today — including `src/middleware.ts`
running and setting the `x-astro-azure-demo` header.

The example already has a working Elysia demo (`src/lib/elysia-app.ts`,
mounted inside `src/pages/api/elysia/[...slugs].ts`). That demo shows Elysia
running *inside* an Astro endpoint. This new demo shows the inverse: Elysia
running *as* the top-level request handler, ahead of Astro's router. The two
are kept side by side, unmodified relative to each other, to let the dashboard
contrast both integration styles.

## Goals

- Add a new `/api/edge/*` demo backed by `src/fetch.ts`, using a dedicated
  Elysia instance scoped to that prefix.
- Every request outside `/api/edge/*` must behave exactly as it does today
  (same headers, same routes, same fallback behavior) — verified, not assumed.
- No changes to the adapter package, CI, lint/knip config, or any existing
  page/route/middleware file other than the dashboard's link list.

## Non-Goals

- Not replacing or refactoring the existing `/api/elysia/*` nested-Elysia demo.
- Not adding the "wrap all traffic with a timing header" variant (considered,
  rejected — it would touch every existing response, which is explicitly out
  of scope per the "no other areas impacted" requirement).
- Not updating `ROADMAP.md`'s separate "live request-stats dashboard island"
  item — unrelated work already tracked there.

## Design

### `examples/basic/src/fetch.ts` (new file)

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

Any path outside `/api/edge/*` (e.g. `/about`, `/api/elysia`, `/middleware`)
produces Elysia's `NOT_FOUND` code, which the `onError` handler routes to
`astro(new FetchState(request))` — Astro's standard pipeline, unchanged.

This mirrors the existing `onError` NOT_FOUND pattern already used in
`lib/elysia-app.ts` (which works around a singleton-Response race in Elysia's
default 404 path), so the new app inherits that same safety property for
free: 404s never hit the buggy shared-singleton path because `onError`
intercepts them first.

### `examples/basic/src/pages/index.astro` (edit)

Add two entries to the existing `checks` array, alongside the current
`/api/elysia` entries, labeled to make the contrast obvious:

```ts
["/api/edge", "Astro 7 Advanced Routing (src/fetch.ts) + Elysia"],
["/api/edge/greet/swa", "Advanced Routing param route"],
```

Incidental fix in the same file: the page header text still reads "Astro 6 on
Azure Static Web Apps" / copy referencing Astro 6, left over from before the
Astro 7 upgrade (`feat: aztro 7 upgrade` commit). Update to Astro 7 while
editing this section.

### `examples/basic/README.md` (edit)

Add a short section describing the `/api/edge/*` routes, what `src/fetch.ts`
is, and how it differs from the nested `/api/elysia/*` integration — so a
reader of the example understands why there are two different Elysia
mounting styles in the same app.

## Impact Check

| Area | Touched? | Why |
|---|---|---|
| `packages/astro-azure-swa` (adapter) | No | Advanced Routing is a pure Astro-core/Vite feature; adapter's `App.render()` already dispatches through it unconditionally. |
| `astro.config.ts` | No | No `fetchFile` override needed; default `src/fetch.ts` resolution is used as-is. |
| `src/middleware.ts` | No | Untouched; still runs for every request that falls through to `astro()`, i.e. everything except `/api/edge/*`. |
| `src/lib/elysia-app.ts`, `[...slugs].ts` | No | Separate Elysia instance, separate mount path, reached only via the `astro()` fallback. |
| `src/pages/index.astro` | Yes (additive) | Two new link cards + one incidental stale-version-text fix. |
| `README.md` (example) | Yes (additive) | New section documenting the demo. |
| CI / lint / knip | No | Knip's scope is `packages/astro-azure-swa` only; CI's `test:example` step is just `astro build`, which will simply include the new route. |

## Testing / Verification

1. `bun run --cwd examples/basic dev` — hit `/api/edge` and
   `/api/edge/greet/swa` directly, confirm JSON responses and absence of the
   `x-astro-azure-demo` header (proving the request never reached Astro's
   middleware).
2. Click through existing dashboard links (`/about`, `/api/elysia`,
   `/api/elysia/greet/swa`, `/middleware`, `/hybrid`, `/blog`) and confirm
   identical behavior to before this change, including the
   `x-astro-azure-demo` header still present on those responses.
3. `bun run typecheck` and `bun run test:example` (matches CI's `Build
   Example` step).
