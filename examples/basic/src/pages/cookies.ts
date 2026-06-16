import type { APIRoute } from "astro";

export const GET: APIRoute = () => {
  const headers = new Headers({
    "content-type": "application/json",
  });

  headers.append("set-cookie", "demo_session=alpha; Path=/; HttpOnly; SameSite=Lax");
  headers.append("set-cookie", "demo_theme=dark; Path=/; Max-Age=3600; SameSite=Lax");

  return new Response(
    JSON.stringify({
      cookies: ["demo_session", "demo_theme"],
    }),
    {
      headers,
    },
  );
};

