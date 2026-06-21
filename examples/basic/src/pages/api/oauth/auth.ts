import type { APIRoute } from "astro";

const githubAuthorizeUrl = "https://github.com/login/oauth/authorize";
const stateCookieName = "decap_github_oauth_state";

export const GET: APIRoute = ({ request }) => {
  const url = new URL(request.url);
  const provider = url.searchParams.get("provider") ?? "github";

  if (provider !== "github") {
    return textResponse("Unsupported OAuth provider", 400);
  }

  const clientId = process.env.GITHUB_OAUTH_CLIENT_ID;

  if (!clientId) {
    return textResponse("Missing GITHUB_OAUTH_CLIENT_ID", 500);
  }

  const callbackUrl = new URL("/api/oauth/callback", url.origin);
  const authorizeUrl = new URL(githubAuthorizeUrl);
  const repoIsPrivate = process.env.GITHUB_REPO_PRIVATE === "1";
  const state = crypto.randomUUID();

  authorizeUrl.searchParams.set("client_id", clientId);
  authorizeUrl.searchParams.set("redirect_uri", callbackUrl.toString());
  authorizeUrl.searchParams.set("scope", repoIsPrivate ? "repo user" : "public_repo user");
  authorizeUrl.searchParams.set("state", state);

  return new Response(null, {
    status: 302,
    headers: {
      location: authorizeUrl.toString(),
      "set-cookie": createStateCookie(state, url.protocol === "https:"),
      "cache-control": "no-store",
    },
  });
};

function createStateCookie(state: string, secure: boolean): string {
  const parts = [
    `${stateCookieName}=${state}`,
    "Path=/api/oauth/callback",
    "HttpOnly",
    "SameSite=Lax",
  ];

  if (secure) {
    parts.push("Secure");
  }

  return parts.join("; ");
}

function textResponse(message: string, status: number): Response {
  return new Response(message, {
    status,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
