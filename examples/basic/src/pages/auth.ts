import type { APIRoute } from "astro";

export const GET: APIRoute = () => {
  return new Response(null, {
    status: 302,
    headers: {
      location: "/auth/check",
      "set-cookie": "demo_auth=authenticated; Path=/; HttpOnly; SameSite=Lax",
    },
  });
};

