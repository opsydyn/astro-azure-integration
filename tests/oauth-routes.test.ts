import { afterEach, describe, expect, it, vi } from "vitest";

import { GET as authGet } from "../examples/basic/src/pages/api/oauth/auth";
import { GET as callbackGet } from "../examples/basic/src/pages/api/oauth/callback";

const originalClientId = process.env.GITHUB_OAUTH_CLIENT_ID;
const originalClientSecret = process.env.GITHUB_OAUTH_CLIENT_SECRET;
const originalRepoPrivate = process.env.GITHUB_REPO_PRIVATE;

afterEach(() => {
  setOptionalEnv("GITHUB_OAUTH_CLIENT_ID", originalClientId);
  setOptionalEnv("GITHUB_OAUTH_CLIENT_SECRET", originalClientSecret);
  setOptionalEnv("GITHUB_REPO_PRIVATE", originalRepoPrivate);
  vi.unstubAllGlobals();
});

describe("Decap GitHub OAuth routes", () => {
  it("auth redirects with the public repo scope and state cookie", async () => {
    process.env.GITHUB_OAUTH_CLIENT_ID = "client-id";
    process.env.GITHUB_REPO_PRIVATE = "0";

    const response = authGet(routeContext("https://example.test/api/oauth/auth?provider=github"));

    expect(response.status).toBe(302);
    expect(response.headers.get("cache-control")).toBe("no-store");

    const location = response.headers.get("location");
    expect(location).toBeTruthy();
    const authorizeUrl = new URL(location ?? "");
    expect(authorizeUrl.searchParams.get("client_id")).toBe("client-id");
    expect(authorizeUrl.searchParams.get("redirect_uri")).toBe(
      "https://example.test/api/oauth/callback",
    );
    expect(authorizeUrl.searchParams.get("scope")).toBe("public_repo");

    const state = authorizeUrl.searchParams.get("state");
    expect(state).toBeTruthy();

    const cookie = response.headers.get("set-cookie");
    expect(cookie).toContain(`decap_github_oauth_state=${state}`);
    expect(cookie).toContain("Path=/api/oauth/callback");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Secure");
  });

  it('auth redirects with the repo scope when GITHUB_REPO_PRIVATE is "1"', async () => {
    process.env.GITHUB_OAUTH_CLIENT_ID = "client-id";
    process.env.GITHUB_REPO_PRIVATE = "1";

    const response = authGet(routeContext("https://example.test/api/oauth/auth?provider=github"));

    expect(response.status).toBe(302);
    expect(response.headers.get("cache-control")).toBe("no-store");

    const location = response.headers.get("location");
    expect(location).toBeTruthy();
    const authorizeUrl = new URL(location ?? "");
    expect(authorizeUrl.searchParams.get("scope")).toBe("repo");
  });

  it("auth accepts an exact Decap scope query parameter", async () => {
    process.env.GITHUB_OAUTH_CLIENT_ID = "client-id";
    process.env.GITHUB_REPO_PRIVATE = "0";

    const response = authGet(
      routeContext("https://example.test/api/oauth/auth?provider=github&scope=repo"),
    );

    expect(response.status).toBe(302);

    const location = response.headers.get("location");
    expect(location).toBeTruthy();
    const authorizeUrl = new URL(location ?? "");
    expect(authorizeUrl.searchParams.get("scope")).toBe("repo");
  });

  it("auth rejects broader Decap scope query parameters", async () => {
    process.env.GITHUB_OAUTH_CLIENT_ID = "client-id";

    const broadScopeResponse = authGet(
      routeContext("https://example.test/api/oauth/auth?provider=github&scope=repo%20user"),
    );

    expect(broadScopeResponse.status).toBe(400);
    expect(broadScopeResponse.headers.get("cache-control")).toBe("no-store");
    await expect(broadScopeResponse.text()).resolves.toContain("Unsupported GitHub OAuth scope");

    const emptyScopeResponse = authGet(
      routeContext("https://example.test/api/oauth/auth?provider=github&scope="),
    );

    expect(emptyScopeResponse.status).toBe(400);
    expect(emptyScopeResponse.headers.get("cache-control")).toBe("no-store");
    await expect(emptyScopeResponse.text()).resolves.toContain("Unsupported GitHub OAuth scope");
  });

  it("callback rejects missing and mismatched state before token exchange", async () => {
    process.env.GITHUB_OAUTH_CLIENT_ID = "client-id";
    process.env.GITHUB_OAUTH_CLIENT_SECRET = "client-secret";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const missingState = await callbackGet(
      routeContext("https://example.test/api/oauth/callback?provider=github&code=abc"),
    );

    expect(missingState.status).toBe(400);
    await expect(missingState.text()).resolves.toContain("Missing GitHub OAuth state");

    const mismatchedState = await callbackGet(
      routeContext("https://example.test/api/oauth/callback?provider=github&code=abc&state=query", {
        cookie: "decap_github_oauth_state=cookie",
      }),
    );

    expect(mismatchedState.status).toBe(400);
    await expect(mismatchedState.text()).resolves.toContain("Invalid GitHub OAuth state");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("callback success HTML validates opener origin and avoids wildcard token delivery", async () => {
    process.env.GITHUB_OAUTH_CLIENT_ID = "client-id";
    process.env.GITHUB_OAUTH_CLIENT_SECRET = "client-secret";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          access_token: "token<value",
        }),
      ),
    );

    const response = await callbackGet(
      routeContext("https://example.test/api/oauth/callback?provider=github&code=abc&state=state-1", {
        cookie: "decap_github_oauth_state=state-1",
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("set-cookie")).toContain("decap_github_oauth_state=;");

    const html = await response.text();
    expect(html).toContain('const expectedOrigin = "https://example.test";');
    expect(html).toContain("event.origin !== expectedOrigin");
    expect(html).toContain("event.source !== window.opener");
    expect(html).toContain('window.opener.postMessage("authorizing:github", expectedOrigin);');
    expect(html).toContain("authorization:github:success:");
    expect(html).toContain("expectedOrigin");
    expect(html).not.toContain('postMessage(\n          `authorization:github:success:${payload}`,\n          "*"');
    expect(html).not.toContain('postMessage("authorizing:github", "*")');
  });

  it("rejects unsupported providers", async () => {
    const authResponse = authGet(
      routeContext("https://example.test/api/oauth/auth?provider=gitlab"),
    );
    const callbackResponse = await callbackGet(
      routeContext("https://example.test/api/oauth/callback?provider=gitlab&code=abc"),
    );

    expect(authResponse.status).toBe(400);
    await expect(authResponse.text()).resolves.toContain("Unsupported OAuth provider");
    expect(callbackResponse.status).toBe(400);
    await expect(callbackResponse.text()).resolves.toContain("Unsupported OAuth provider");
  });

  it("returns controlled no-store 502 responses for token exchange failures", async () => {
    process.env.GITHUB_OAUTH_CLIENT_ID = "client-id";
    process.env.GITHUB_OAUTH_CLIENT_SECRET = "client-secret";

    await expectCallbackTokenFailure(
      Promise.resolve(new Response("not-json", { status: 200 })),
      "GitHub OAuth token exchange returned invalid JSON",
    );
    await expectCallbackTokenFailure(
      Promise.resolve(Response.json({ error: "bad_verification_code" }, { status: 400 })),
      "bad_verification_code",
    );
    await expectCallbackTokenFailure(
      Promise.resolve(Response.json({})),
      "GitHub OAuth token exchange did not return an access token",
    );
    await expectCallbackTokenFailure(
      Promise.reject(new Error("network failed")),
      "GitHub OAuth token exchange failed",
    );
  });
});

async function expectCallbackTokenFailure(
  fetchResult: Promise<Response>,
  expectedMessage: string,
): Promise<void> {
  vi.stubGlobal("fetch", vi.fn().mockReturnValue(fetchResult));

  const response = await callbackGet(
    routeContext("https://example.test/api/oauth/callback?provider=github&code=abc&state=state-1", {
      cookie: "decap_github_oauth_state=state-1",
    }),
  );

  expect(response.status).toBe(502);
  expect(response.headers.get("cache-control")).toBe("no-store");
  await expect(response.text()).resolves.toContain(expectedMessage);
}

function routeContext(url: string, headers?: HeadersInit) {
  return {
    request: new Request(url, {
      headers,
    }),
  } as Parameters<typeof authGet>[0];
}

function setOptionalEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
    return;
  }

  process.env[key] = value;
}
