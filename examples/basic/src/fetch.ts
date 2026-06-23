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
