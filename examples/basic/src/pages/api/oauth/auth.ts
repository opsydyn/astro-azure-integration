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
  const scope = getGithubScope(url, repoIsPrivate);

  if (!scope) {
    return textResponse("Unsupported GitHub OAuth scope", 400);
  }

  const state = crypto.randomUUID();

  authorizeUrl.searchParams.set("client_id", clientId);
  authorizeUrl.searchParams.set("redirect_uri", callbackUrl.toString());
  authorizeUrl.searchParams.set("scope", scope);
  authorizeUrl.searchParams.set("state", state);

  return new Response(createRedirectHtml(authorizeUrl), {
    status: 200,
    headers: {
      "set-cookie": createStateCookie(state, url.protocol === "https:"),
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
};

function createRedirectHtml(authorizeUrl: URL): string {
  const location = authorizeUrl.toString().replaceAll("<", "\\u003c");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Authorizing with GitHub</title>
  </head>
  <body>
    <p>Redirecting to GitHub...</p>
    <script>
      window.location.replace(${JSON.stringify(location)});
    </script>
  </body>
</html>`;
}

function getGithubScope(url: URL, repoIsPrivate: boolean): string | undefined {
  const requestedScope = url.searchParams.get("scope");
  const modeScope = repoIsPrivate ? "repo" : "public_repo";

  if (requestedScope !== null) {
    return requestedScope === modeScope ? requestedScope : undefined;
  }

  return modeScope;
}

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
