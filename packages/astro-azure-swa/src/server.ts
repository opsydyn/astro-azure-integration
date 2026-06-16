import { app } from "@azure/functions";
import { createApp } from "astro/app/entrypoint";

import { toAzureResponse, toWebRequest } from "./bridge.js";

const astroApp = createApp();

app.http("server", {
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"],
  authLevel: "anonymous",
  route: "{*path}",
  handler: async (request) => {
    const webRequest = await toWebRequest(request);
    const response = await astroApp.render(webRequest);
    return toAzureResponse(response);
  },
});
