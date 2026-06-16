import type { HttpRequest, HttpResponseInit } from "@azure/functions";
import { createApp } from "astro/app/entrypoint";

import { toAzureResponse, toWebRequest } from "./bridge.js";

const astroApp = createApp();

export async function handleAzureSwaRequest(
  request: HttpRequest,
): Promise<HttpResponseInit> {
  const webRequest = await toWebRequest(request);
  const response = await astroApp.render(webRequest);
  return toAzureResponse(response);
}
