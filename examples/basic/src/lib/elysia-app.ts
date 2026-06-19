import { Elysia, t } from "elysia";
import { openapi } from "@elysiajs/openapi";
import { spectralPlugin } from "@opsydyn/elysia-spectral";

export const app = new Elysia({ prefix: "/api/elysia" })
  // Elysia's default 404 path clones one shared singleton Response per
  // compiled handler with no concurrency guard: overlapping requests to any
  // unmatched route race on the same underlying stream and corrupt it
  // ("Response.clone: Body has already been consumed"), 500ing every
  // unmatched request after the first collision for the life of the
  // process. Registering onError routes 404s through app.handleError
  // instead, which builds a fresh Response per request and sidesteps the
  // shared singleton entirely.
  .onError(({ code, set }) => {
    if (code === "NOT_FOUND") {
      set.status = 404;
      return "Not Found";
    }
  })
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
      source: { specPath: "/api/elysia/openapi/json" },
      dashboard: {},
      healthcheck: {},
      startup: { mode: "off" },
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

// Eden's treaty client infers request/response types from this type alone —
// it is erased at build time, so no server code reaches the client bundle.
export type App = typeof app;

// In Node.js serverless the Bun adapter never calls app.listen(), so onStart
// lifecycle handlers never fire automatically. Call them once lazily so the
// spectralPlugin's hostAppRef is initialised before any dashboard/healthcheck
// request arrives.
let _startPromise: Promise<void> | null = null;
export const ensureStarted = (): Promise<void> => {
  if (!_startPromise) {
    type StartHandler = { fn: (a: typeof app) => unknown };
    type AppWithEvents = typeof app & { event: { start: StartHandler[] } };
    _startPromise = Promise.allSettled(
      (app as AppWithEvents).event.start.map(({ fn }) => fn(app)),
    ).then(() => {});
  }
  return _startPromise;
};
