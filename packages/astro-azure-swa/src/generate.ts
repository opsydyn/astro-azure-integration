import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export interface GenerateAzureSwaFilesOptions {
  distDir: URL;
  functionName: string;
}

const methods = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"];

export async function generateAzureSwaFiles({
  distDir,
  functionName,
}: GenerateAzureSwaFilesOptions): Promise<void> {
  const distPath = fileURLToPath(distDir);
  const apiPath = join(distPath, "api");
  const functionPath = join(apiPath, functionName);

  await mkdir(functionPath, { recursive: true });

  await writeJson(join(apiPath, "host.json"), {
    version: "2.0",
    extensions: {
      http: {
        routePrefix: "",
      },
    },
  });

  await writeJson(join(apiPath, "package.json"), {
    type: "module",
    main: `${functionName}/index.mjs`,
    dependencies: {
      "@azure/functions": "^4.0.0",
      astro: "^6.0.0",
    },
  });

  await writeFile(
    join(functionPath, "index.mjs"),
    renderFunctionEntrypoint(functionName),
    "utf8",
  );

  await writeFile(join(functionPath, "bridge.mjs"), renderBridgeModule(), "utf8");

  await writeJson(join(distPath, "staticwebapp.config.json"), {
    navigationFallback: {
      rewrite: `/api/${functionName}`,
    },
    routes: [
      {
        route: "/_astro/*",
        headers: {
          "cache-control": "public, max-age=31536000, immutable",
        },
      },
    ],
  });
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function renderFunctionEntrypoint(functionName: string): string {
  return `import { app } from "@azure/functions";
import { createApp } from "astro/app/entrypoint";
import { toAzureResponse, toWebRequest } from "./bridge.mjs";

const astroApp = createApp();

app.http(${JSON.stringify(functionName)}, {
  methods: ${JSON.stringify(methods)},
  authLevel: "anonymous",
  route: "{*path}",
  handler: async (request) => {
    const webRequest = await toWebRequest(request);
    const response = await astroApp.render(webRequest);
    return toAzureResponse(response);
  },
});
`;
}

function renderBridgeModule(): string {
  return `const BODYLESS_METHODS = new Set(["GET", "HEAD"]);

export async function toWebRequest(request) {
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

export async function toAzureResponse(response) {
  const headers = {};

  response.headers.forEach((value, key) => {
    headers[key] = value;
  });

  return {
    status: response.status,
    headers,
    body: await response.arrayBuffer(),
  };
}
`;
}
