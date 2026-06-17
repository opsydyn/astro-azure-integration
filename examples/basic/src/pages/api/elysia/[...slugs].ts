import { Elysia, t } from "elysia";
import { openapi } from "@elysiajs/openapi";
import { spectralPlugin } from "@opsydyn/elysia-spectral";

const app = new Elysia({ prefix: "/api/elysia" })
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
      // Serverless: skip startup lint to avoid cold-start latency.
      // Trigger via GET /api/elysia/__lint?fresh=1 instead.
      startup: { mode: "off" },
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

const handle = ({ request }: { request: Request }) => app.handle(request);

export const GET = handle;
export const POST = handle;
