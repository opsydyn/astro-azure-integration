import type { APIRoute } from "astro";

export const GET: APIRoute = ({ request }) => {
  const cookie = request.headers.get("cookie") ?? "";

  return Response.json({
    authenticated: cookie.includes("demo_auth=authenticated"),
  });
};

