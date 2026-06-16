import type { APIRoute } from "astro";

export const POST: APIRoute = async ({ request }) => {
  const body = await request.text();

  return Response.json({
    method: request.method,
    body,
  });
};
