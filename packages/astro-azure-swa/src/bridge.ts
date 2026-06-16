import type { HttpRequest, HttpResponseInit } from "@azure/functions";

const BODYLESS_METHODS = new Set(["GET", "HEAD"]);

export async function toWebRequest(request: HttpRequest): Promise<Request> {
  const method = request.method.toUpperCase();
  const headers = new Headers();

  for (const [key, value] of request.headers.entries()) {
    headers.set(key, value);
  }

  const body = BODYLESS_METHODS.has(method)
    ? undefined
    : await request.arrayBuffer();

  return new Request(request.url, {
    method,
    headers,
    body,
  });
}

export async function toAzureResponse(
  response: Response,
): Promise<HttpResponseInit> {
  const headers: Record<string, string> = {};

  response.headers.forEach((value, key) => {
    headers[key] = value;
  });

  return {
    status: response.status,
    headers,
    body: await response.arrayBuffer(),
  };
}
