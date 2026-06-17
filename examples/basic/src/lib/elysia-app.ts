import { Elysia, t } from "elysia";
import { openapi } from "@elysiajs/openapi";
import { spectralPlugin } from "@opsydyn/elysia-spectral";

export const app = new Elysia({ prefix: "/api/elysia" })
  .use(
    openapi({
      documentation: {
        info: {
          title: "Azure SWA + Elysia API",
          version: "1.0.0",
          description:
            "Elysia router running inside Azure Functions v4 via @opsydyn/astro-azure-swa.",
        },
        tags: [{ name: "demo", description: "Adapter demo routes" }],
      },
    }),
  )
  .use(
    spectralPlugin({
      preset: "recommended",
      // Report mode: log if lint exceeds threshold at startup, but don't fail.
      startup: { mode: "report" },
      // The @elysiajs/openapi JSON spec is at /openapi/json relative to the
      // Elysia app, but the spectral plugin fetches it via app.handle() using
      // the full path. With prefix /api/elysia the full path is /api/elysia/openapi/json.
      source: { specPath: "/api/elysia/openapi/json" },
      healthcheck: { path: "/__lint" },
      dashboard: {},
    }),
  )
  .get(
    "/",
    () => ({
      ok: true,
      runtime: "azure-functions-v4",
      adapter: "@opsydyn/astro-azure-swa",
    }),
    {
      detail: {
        summary: "Health check",
        description: "Confirms the Elysia router is running inside Azure Functions.",
        tags: ["demo"],
      },
    },
  )
  .get(
    "/greet/:name",
    ({ params: { name } }) => ({ greeting: `Hello, ${name}!` }),
    {
      detail: {
        summary: "Greet by name",
        description: "Returns a personalised greeting using a typed URL parameter.",
        tags: ["demo"],
      },
    },
  )
  .post(
    "/echo",
    ({ body }) => body,
    {
      body: t.Object({ message: t.String() }),
      detail: {
        summary: "Echo message",
        description: "Validates the request body with t.Object and echoes it back.",
        tags: ["demo"],
      },
    },
  );

// Elysia only triggers onStart via app.listen() (Bun server mode). In Node.js
// Azure Functions, app.handle() is used directly and onStart never fires.
// The spectral plugin stores its host app reference in onStart, so without
// triggering it the dashboard always returns 503.
// We replicate what the Bun adapter does: iterate app.event.start and call
// each handler with the app as context.
type StartHandler = { fn: (ctx: typeof app) => unknown };
const startHandlers: StartHandler[] =
  (app as unknown as { event?: { start?: StartHandler[] } }).event?.start ?? [];
await Promise.allSettled(startHandlers.map(({ fn }) => fn(app)));
