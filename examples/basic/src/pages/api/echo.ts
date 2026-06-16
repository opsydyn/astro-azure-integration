import type { APIRoute } from "astro";

export const POST: APIRoute = async ({ request }) => {
  return Response.json({
    method: request.method,
    body: await request.text(),
    demoHeader: request.headers.get("x-demo"),
  });
};

