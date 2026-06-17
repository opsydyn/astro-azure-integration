import { app, ensureStarted } from "../../../lib/elysia-app.ts";

const handle = async ({ request }: { request: Request }) => {
  await ensureStarted();
  return app.handle(request);
};

export const GET = handle;
export const POST = handle;
