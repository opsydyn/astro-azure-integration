import type { Cookie, HttpRequest, HttpResponseInit } from "@azure/functions";

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
  const url = headers.get("x-ms-original-url") ?? request.url;

  return new Request(url, {
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

function parseSetCookieHeaders(headers: Headers): Cookie[] {
  const setCookieHeaders =
    typeof headers.getSetCookie === "function"
      ? headers.getSetCookie()
      : headers.get("set-cookie")
        ? [headers.get("set-cookie") as string]
        : [];

  return setCookieHeaders.map(parseSetCookieHeader).filter(Boolean) as Cookie[];
}

function parseSetCookieHeader(header: string): Cookie | undefined {
  const [nameValue, ...attributePairs] = header.split(";");
  const separatorIndex = nameValue.indexOf("=");
  if (separatorIndex === -1) {
    return undefined;
  }

  const cookie: Cookie = {
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
      cookie.sameSite = value as Cookie["sameSite"];
    } else if (name === "secure") {
      cookie.secure = true;
    } else if (name === "httponly") {
      cookie.httpOnly = true;
    }
  }

  return cookie;
}
