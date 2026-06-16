import type { APIRoute } from "astro";

export const GET: APIRoute = () => {
  return new Response(null, {
    status: 302,
    headers: {
      location: "/about",
      "set-cookie": "redirected=yes; Path=/; HttpOnly",
    },
  });
};
