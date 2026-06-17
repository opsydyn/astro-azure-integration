import { Elysia, t } from "elysia";

const app = new Elysia({ prefix: "/api/elysia" })
  .get("/", () => ({
    ok: true,
    runtime: "azure-functions-v4",
    adapter: "@opsydyn/astro-azure-swa",
  }))
  .get("/greet/:name", ({ params: { name } }) => ({
    greeting: `Hello, ${name}!`,
  }))
  .post(
    "/echo",
    ({ body }) => body,
    { body: t.Object({ message: t.String() }) },
  );

const handle = ({ request }: { request: Request }) => app.handle(request);

export const GET = handle;
export const POST = handle;
