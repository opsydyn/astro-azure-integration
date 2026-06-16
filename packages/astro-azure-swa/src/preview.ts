import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { extname, join, normalize, relative, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import type { Cookie, HttpResponseInit } from "@azure/functions";
import type { CreatePreviewServer, PreviewServerParams } from "astro";

interface PreviewEntrypoint {
  handleAzureSwaRequest: (request: PreviewHttpRequest) => Promise<HttpResponseInit>;
}

interface PreviewHttpRequest {
  url: string;
  method: string;
  headers: Headers;
  arrayBuffer: () => Promise<ArrayBuffer>;
  text: () => Promise<string>;
}

const BODYLESS_METHODS = new Set(["GET", "HEAD"]);
const MIME_TYPES: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

const createPreviewServer: CreatePreviewServer = async (params) => {
  const entrypoint = (await import(
    params.serverEntrypoint.href
  )) as PreviewEntrypoint;
  const clientPath = fileURLToPath(params.client);

  const server = createServer(async (request, response) => {
    try {
      if (await serveStaticFile(request, response, params, clientPath)) {
        return;
      }

      const azureRequest = await toPreviewHttpRequest(request, params);
      const azureResponse = await entrypoint.handleAzureSwaRequest(azureRequest);
      await writeAzureResponse(response, azureResponse);
    } catch (error) {
      params.logger.error(
        error instanceof Error ? error.stack ?? error.message : String(error),
      );
      response.statusCode = 500;
      response.end("Internal server error");
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(params.port, params.host, () => {
      server.off("error", reject);
      resolve();
    });
  });

  const address = server.address();
  const port =
    typeof address === "object" && address !== null ? address.port : params.port;

  params.logger.info(
    `Preview server listening on http://${params.host ?? "localhost"}:${port}`,
  );

  return {
    host: params.host,
    port,
    closed() {
      return new Promise<void>((resolve, reject) => {
        server.once("close", resolve);
        server.once("error", reject);
      });
    },
    stop() {
      return new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      });
    },
  };
};

async function serveStaticFile(
  request: IncomingMessage,
  response: ServerResponse,
  params: PreviewServerParams,
  clientPath: string,
): Promise<boolean> {
  const method = request.method?.toUpperCase() ?? "GET";
  if (method !== "GET" && method !== "HEAD") {
    return false;
  }

  const url = getRequestUrl(request, params);
  const pathname = stripBase(url.pathname, params.base);
  if (pathname === null) {
    return false;
  }

  const fileMatch = await resolveClientFile(clientPath, pathname);
  if (!fileMatch) {
    return false;
  }

  if (pathname === "/" && fileMatch.size === 0) {
    return false;
  }

  response.statusCode = 200;
  response.setHeader(
    "content-type",
    MIME_TYPES[extname(fileMatch.path).toLowerCase()] ?? "application/octet-stream",
  );
  response.setHeader("content-length", fileMatch.size);

  if (method === "HEAD") {
    response.end();
    return true;
  }

  await new Promise<void>((resolve, reject) => {
    createReadStream(fileMatch.path)
      .once("error", reject)
      .once("end", resolve)
      .pipe(response);
  });
  return true;
}

async function resolveClientFile(
  clientPath: string,
  pathname: string,
): Promise<{ path: string; size: number } | undefined> {
  const decodedPath = decodeURIComponent(pathname);
  const relativePath = decodedPath === "/" ? "index.html" : decodedPath.slice(1);
  const normalizedPath = normalize(relativePath);

  if (normalizedPath.startsWith("..") || normalizedPath.includes(`..${sep}`)) {
    return undefined;
  }

  const directPath = join(clientPath, normalizedPath);
  if (relative(clientPath, directPath).startsWith("..")) {
    return undefined;
  }

  const directMatch = await getFileMatch(directPath);
  if (directMatch) {
    return directMatch;
  }

  return getFileMatch(join(directPath, "index.html"));
}

async function getFileMatch(
  filePath: string,
): Promise<{ path: string; size: number } | undefined> {
  try {
    const fileStat = await stat(filePath);
    if (fileStat.isFile()) {
      return {
        path: filePath,
        size: fileStat.size,
      };
    }
  } catch {
    return undefined;
  }
}

async function toPreviewHttpRequest(
  request: IncomingMessage,
  params: PreviewServerParams,
): Promise<PreviewHttpRequest> {
  const method = request.method?.toUpperCase() ?? "GET";
  const headers = new Headers();

  for (const [key, value] of Object.entries(request.headers)) {
    if (value === undefined) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        headers.append(key, item);
      }
    } else {
      headers.set(key, value);
    }
  }

  const body = BODYLESS_METHODS.has(method)
    ? new ArrayBuffer(0)
    : await readRequestBody(request);
  const url = getRequestUrl(request, params).href;

  return {
    url,
    method,
    headers,
    arrayBuffer: async () => body.slice(0),
    text: async () => new TextDecoder().decode(body),
  };
}

function getRequestUrl(
  request: IncomingMessage,
  params: PreviewServerParams,
): URL {
  const host = request.headers.host ?? `${params.host ?? "localhost"}:${params.port}`;
  return new URL(request.url ?? "/", `http://${host}`);
}

function stripBase(pathname: string, base: string): string | null {
  if (base === "/" || base === "") {
    return pathname;
  }

  const normalizedBase = base.endsWith("/") ? base.slice(0, -1) : base;
  if (pathname === normalizedBase) {
    return "/";
  }
  if (!pathname.startsWith(`${normalizedBase}/`)) {
    return null;
  }
  return pathname.slice(normalizedBase.length);
}

async function readRequestBody(request: IncomingMessage): Promise<ArrayBuffer> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of request) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }

  const body = Buffer.concat(chunks);
  return body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength);
}

async function writeAzureResponse(
  response: ServerResponse,
  azureResponse: HttpResponseInit,
): Promise<void> {
  response.statusCode = azureResponse.status ?? 200;

  for (const [key, value] of Object.entries(azureResponse.headers ?? {})) {
    if (value !== undefined) {
      response.setHeader(key, value);
    }
  }

  const cookies = (azureResponse as { cookies?: Cookie[] }).cookies ?? [];
  if (cookies.length > 0) {
    response.setHeader("set-cookie", cookies.map(serializeCookie));
  }

  const body = azureResponse.body;
  if (body === undefined || body === null) {
    response.end();
  } else if (body instanceof ArrayBuffer) {
    response.end(Buffer.from(body));
  } else if (ArrayBuffer.isView(body)) {
    response.end(Buffer.from(body.buffer, body.byteOffset, body.byteLength));
  } else if (typeof body === "string" || body instanceof Uint8Array) {
    response.end(body);
  } else {
    response.end(String(body));
  }
}

function serializeCookie(cookie: Cookie): string {
  const parts = [`${cookie.name}=${cookie.value ?? ""}`];

  if (cookie.maxAge !== undefined) {
    parts.push(`Max-Age=${cookie.maxAge}`);
  }
  if (cookie.domain) {
    parts.push(`Domain=${cookie.domain}`);
  }
  if (cookie.path) {
    parts.push(`Path=${cookie.path}`);
  }
  if (cookie.expires) {
    const expires =
      cookie.expires instanceof Date
        ? cookie.expires.toUTCString()
        : new Date(cookie.expires).toUTCString();
    parts.push(`Expires=${expires}`);
  }
  if (cookie.httpOnly) {
    parts.push("HttpOnly");
  }
  if (cookie.secure) {
    parts.push("Secure");
  }
  if (cookie.sameSite) {
    parts.push(`SameSite=${cookie.sameSite}`);
  }

  return parts.join("; ");
}

export default createPreviewServer;
