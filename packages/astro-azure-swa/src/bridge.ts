import type { HttpRequest, HttpResponseInit } from "@azure/functions";

export async function toWebRequest(request: HttpRequest): Promise<Request> {
  throw new Error(`toWebRequest is not implemented for ${request.method}`);
}

export async function toAzureResponse(
  response: Response,
): Promise<HttpResponseInit> {
  throw new Error(`toAzureResponse is not implemented for ${response.status}`);
}
