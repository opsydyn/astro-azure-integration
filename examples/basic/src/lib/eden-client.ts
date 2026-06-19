import { treaty } from "@elysiajs/eden";
import type { App } from "./elysia-app";

export const client = treaty<App>(
  typeof window !== "undefined" ? window.location.origin : "http://localhost",
);
