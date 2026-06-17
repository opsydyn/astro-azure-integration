import { app } from "../../../lib/elysia-app.ts";

const handle = ({ request }: { request: Request }) => app.handle(request);

export const GET = handle;
export const POST = handle;
