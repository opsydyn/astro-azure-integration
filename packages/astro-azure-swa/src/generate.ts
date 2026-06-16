import { copyFile, cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export interface GenerateAzureSwaFilesOptions {
  apiRuntime?: AzureSwaApiRuntime;
  distDir: URL;
  functionName: string;
  projectRoot?: URL;
  staticWebAppConfig?: AzureSwaStaticWebAppConfig;
}

export type AzureSwaApiRuntime = "node:20" | "node:22";

export interface AzureSwaStaticWebAppConfig {
  auth?: Record<string, unknown>;
  globalHeaders?: Record<string, string>;
  mimeTypes?: Record<string, string>;
  navigationFallback?: Record<string, unknown>;
  networking?: Record<string, unknown>;
  platform?: {
    apiRuntime?: AzureSwaApiRuntime;
    [key: string]: unknown;
  };
  responseOverrides?: Record<string, unknown>;
  routes?: AzureSwaRouteConfig[];
  [key: string]: unknown;
}

export interface AzureSwaRouteConfig {
  route: string;
  allowedRoles?: string[];
  headers?: Record<string, string>;
  methods?: string[];
  redirect?: string;
  rewrite?: string;
  statusCode?: number;
  [key: string]: unknown;
}

const DEFAULT_API_RUNTIME: AzureSwaApiRuntime = "node:22";
const methods = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"];

export async function generateAzureSwaFiles({
  apiRuntime,
  distDir,
  functionName,
  projectRoot,
  staticWebAppConfig,
}: GenerateAzureSwaFilesOptions): Promise<void> {
  const hookDirPath = fileURLToPath(distDir);
  const distPath =
    basename(stripTrailingSeparator(hookDirPath)) === "client"
      ? dirname(stripTrailingSeparator(hookDirPath))
      : hookDirPath;
  const apiPath = join(distPath, "api");
  const functionPath = join(apiPath, functionName);

  await mkdir(functionPath, { recursive: true });

  await writeJson(join(apiPath, "host.json"), {
    version: "2.0",
    extensions: {
      http: {
        routePrefix: "api",
      },
    },
  });

  const projectDeps = await readProjectDependencies(projectRoot);

  await writeJson(join(apiPath, "package.json"), {
    type: "module",
    main: `${functionName}/index.mjs`,
    dependencies: {
      // Always required; project's astro version takes precedence if provided.
      astro: "^6.0.0",
      // Merge project deps so framework packages (react, react-dom, etc.) are
      // installed by Oryx at deploy time.
      ...projectDeps,
      // Always pin to our minimum required version.
      "@azure/functions": "^4.0.0",
    },
  });

  await writeFile(
    join(functionPath, "bridge.mjs"),
    renderBridgeModule(),
    "utf8",
  );
  await writeFunctionEntrypoint(distPath, functionPath, functionName);

  const clientPath = join(distPath, "client");
  await mkdir(clientPath, { recursive: true });

  // SWA deploy action requires a default file even for SSR-only apps.
  // The /* → /api rewrite in staticwebapp.config.json means this is never served.
  const indexPath = join(clientPath, "index.html");
  try {
    await writeFile(indexPath, "", { flag: "wx" });
  } catch {
    // file already exists from the Astro build — leave it alone
  }

  await writeJson(
    join(clientPath, "staticwebapp.config.json"),
    createStaticWebAppConfig({
      apiRuntime,
      functionName,
      staticWebAppConfig,
    }),
  );
}

function createStaticWebAppConfig({
  apiRuntime,
  functionName,
  staticWebAppConfig = {},
}: {
  apiRuntime?: AzureSwaApiRuntime;
  functionName: string;
  staticWebAppConfig?: AzureSwaStaticWebAppConfig;
}): AzureSwaStaticWebAppConfig {
  const userRoutes = staticWebAppConfig.routes ?? [];
  // If the user provides a /* catch-all they are taking ownership of all routing;
  // our generated / route and navigationFallback would be unreachable, so omit them.
  const userOwnsWildcard = userRoutes.some(({ route }) => route === "/*");
  const functionPath = `/api/${functionName}`;

  const config: AzureSwaStaticWebAppConfig = {
    ...staticWebAppConfig,
    platform: {
      ...staticWebAppConfig.platform,
      apiRuntime:
        apiRuntime ??
        staticWebAppConfig.platform?.apiRuntime ??
        DEFAULT_API_RUNTIME,
    },
    routes: mergeRoutes(userRoutes, [
      {
        route: "/_astro/*",
        headers: { "cache-control": "public, max-age=31536000, immutable" },
      },
      // Explicit root rewrite so the deploy-action placeholder index.html is never
      // served to users; only added when a user /* rule won't make it unreachable.
      ...(userOwnsWildcard ? [] : [{ route: "/", rewrite: functionPath }]),
    ]),
  };

  // navigationFallback handles every SSR route that has no matching static file,
  // enabling hybrid rendering (pre-rendered pages are served from CDN directly).
  // Skipped when the user provides /* (they control all routing) or their own fallback.
  if (!userOwnsWildcard) {
    config.navigationFallback = staticWebAppConfig.navigationFallback ?? {
      rewrite: functionPath,
      exclude: ["/_astro/*"],
    };
  } else if (staticWebAppConfig.navigationFallback) {
    config.navigationFallback = staticWebAppConfig.navigationFallback;
  }

  return config;
}

function mergeRoutes(
  customRoutes: AzureSwaRouteConfig[],
  generatedRoutes: AzureSwaRouteConfig[],
): AzureSwaRouteConfig[] {
  const customRoutePaths = new Set(customRoutes.map(({ route }) => route));
  const assetRoute = generatedRoutes.find(({ route }) => route === "/_astro/*");
  const rootRoute = generatedRoutes.find(({ route }) => route === "/");
  const otherGeneratedRoutes = generatedRoutes.filter(
    ({ route }) => route !== "/_astro/*" && route !== "/" && !customRoutePaths.has(route),
  );

  return [
    ...(assetRoute && !customRoutePaths.has("/_astro/*") ? [assetRoute] : []),
    ...customRoutes,
    ...otherGeneratedRoutes,
    ...(rootRoute && !customRoutePaths.has("/") ? [rootRoute] : []),
  ];
}

async function readProjectDependencies(
  projectRoot: URL | undefined,
): Promise<Record<string, string>> {
  if (!projectRoot) return {};
  try {
    const pkgPath = join(fileURLToPath(projectRoot), "package.json");
    const pkg = JSON.parse(await readFile(pkgPath, "utf8")) as {
      dependencies?: Record<string, string>;
    };
    return Object.fromEntries(
      Object.entries(pkg.dependencies ?? {}).filter(
        ([, version]) => !String(version).startsWith("workspace:"),
      ),
    );
  } catch {
    return {};
  }
}

function stripTrailingSeparator(path: string): string {
  return path.endsWith("/") ? path.slice(0, -1) : path;
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writeFunctionEntrypoint(
  distPath: string,
  functionPath: string,
  functionName: string,
): Promise<void> {
  const serverPath = join(distPath, "server");
  const serverEntrypoint = join(serverPath, "entry.mjs");

  try {
    await cp(serverPath, functionPath, { recursive: true });
    await copyFile(serverEntrypoint, join(functionPath, "entry.mjs"));
    await writeFile(
      join(functionPath, "index.mjs"),
      renderAzureFunctionWrapper(functionName),
      "utf8",
    );
  } catch (error) {
    if (!isMissingFileError(error)) {
      throw error;
    }

    await writeFile(
      join(functionPath, "index.mjs"),
      renderFunctionEntrypoint(functionName),
      "utf8",
    );
  }
}

function renderAzureFunctionWrapper(functionName: string): string {
  return `import { app } from "@azure/functions";
import { handleAzureSwaRequest } from "./entry.mjs";

app.http(${JSON.stringify(functionName)}, {
  methods: ${JSON.stringify(methods)},
  authLevel: "anonymous",
  route: "{*path}",
  handler: handleAzureSwaRequest,
});
`;
}

function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
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
  const url = headers.get("x-ms-original-url") ?? request.url;

  return new Request(url, {
    method,
    headers,
    body,
  });
}

export async function toAzureResponse(response) {
  const headers = {};

  response.headers.forEach((value, key) => {
    if (key !== "set-cookie") {
      headers[key] = value;
    }
  });

  return {
    status: response.status,
    headers,
    cookies: parseSetCookieHeaders(response.headers),
    body: await response.arrayBuffer(),
  };
}

function parseSetCookieHeaders(headers) {
  const setCookieHeaders =
    typeof headers.getSetCookie === "function"
      ? headers.getSetCookie()
      : headers.get("set-cookie")
        ? [headers.get("set-cookie")]
        : [];

  return setCookieHeaders.map(parseSetCookieHeader).filter(Boolean);
}

function parseSetCookieHeader(header) {
  const [nameValue, ...attributePairs] = header.split(";");
  const separatorIndex = nameValue.indexOf("=");
  if (separatorIndex === -1) {
    return undefined;
  }

  const cookie = {
    name: nameValue.slice(0, separatorIndex).trim(),
    value: nameValue.slice(separatorIndex + 1).trim(),
  };

  for (const pair of attributePairs) {
    const [rawName, ...rawValue] = pair.trim().split("=");
    const name = rawName.toLowerCase();
    const value = rawValue.join("=");

    if (name === "domain") {
      cookie.domain = value;
    } else if (name === "path") {
      cookie.path = value;
    } else if (name === "expires") {
      const expires = new Date(value);
      if (!Number.isNaN(expires.getTime())) {
        cookie.expires = expires;
      }
    } else if (name === "max-age") {
      const maxAge = Number(value);
      if (!Number.isNaN(maxAge)) {
        cookie.maxAge = maxAge;
      }
    } else if (name === "samesite") {
      cookie.sameSite = value;
    } else if (name === "secure") {
      cookie.secure = true;
    } else if (name === "httponly") {
      cookie.httpOnly = true;
    }
  }

  return cookie;
}
`;
}
