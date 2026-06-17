import type { MiddlewareHandler } from "astro";
import { app } from "./lib/elysia-app.ts";

export const onRequest: MiddlewareHandler = async (context, next) => {
  // Spectral dashboard generates refresh links as root-relative paths
  // (e.g. /__openapi/dashboard?fresh=1) without the Elysia prefix.
  // Intercept them here and forward to the Elysia app with the prefix restored.
  const { pathname } = context.url;
  if (pathname.startsWith("/__openapi") || pathname === "/__lint") {
    const url = new URL(context.request.url);
    url.pathname = `/api/elysia${pathname}`;
    return app.handle(new Request(url, context.request));
  }

  const response = await next();
  response.headers.set("x-astro-azure-demo", "middleware");
  return response;
};
