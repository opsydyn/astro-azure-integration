import type { APIRoute } from "astro";

const githubAccessTokenUrl = "https://github.com/login/oauth/access_token";
const stateCookieName = "decap_github_oauth_state";

type GitHubTokenResponse = {
  access_token?: string;
  error?: string;
  error_description?: string;
};

export const GET: APIRoute = async ({ request }) => {
  const url = new URL(request.url);
  const provider = url.searchParams.get("provider") ?? "github";
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (provider !== "github") {
    return textResponse("Unsupported OAuth provider", 400);
  }

  if (!code) {
    return textResponse("Missing GitHub OAuth code", 400);
  }

  const cookieState = getCookie(request, stateCookieName);

  if (!state || !cookieState) {
    return textResponse("Missing GitHub OAuth state", 400, {
      "set-cookie": clearStateCookie(url.protocol === "https:"),
    });
  }

  if (state !== cookieState) {
    return textResponse("Invalid GitHub OAuth state", 400, {
      "set-cookie": clearStateCookie(url.protocol === "https:"),
    });
  }

  const clientId = process.env.GITHUB_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GITHUB_OAUTH_CLIENT_SECRET;

  if (!clientId) {
    return textResponse("Missing GITHUB_OAUTH_CLIENT_ID", 500, {
      "set-cookie": clearStateCookie(url.protocol === "https:"),
    });
  }

  if (!clientSecret) {
    return textResponse("Missing GITHUB_OAUTH_CLIENT_SECRET", 500, {
      "set-cookie": clearStateCookie(url.protocol === "https:"),
    });
  }

  const callbackUrl = new URL("/api/oauth/callback", url.origin);
  let tokenResponse: Response;

  try {
    tokenResponse = await fetch(githubAccessTokenUrl, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: callbackUrl.toString(),
      }),
    });
  } catch {
    return textResponse("GitHub OAuth token exchange failed", 502, {
      "set-cookie": clearStateCookie(url.protocol === "https:"),
    });
  }

  let tokenJson: GitHubTokenResponse;

  try {
    tokenJson = (await tokenResponse.json()) as GitHubTokenResponse;
  } catch {
    return textResponse("GitHub OAuth token exchange returned invalid JSON", 502, {
      "set-cookie": clearStateCookie(url.protocol === "https:"),
    });
  }

  if (!tokenResponse.ok || tokenJson.error) {
    return textResponse(
      tokenJson.error_description ?? tokenJson.error ?? "GitHub OAuth token exchange failed",
      502,
      {
        "set-cookie": clearStateCookie(url.protocol === "https:"),
      },
    );
  }

  if (!tokenJson.access_token) {
    return textResponse("GitHub OAuth token exchange did not return an access token", 502, {
      "set-cookie": clearStateCookie(url.protocol === "https:"),
    });
  }

  return htmlResponse(createCallbackHtml(tokenJson.access_token, url.origin), {
    "set-cookie": clearStateCookie(url.protocol === "https:"),
  });
};

function createCallbackHtml(token: string, expectedOrigin: string): string {
  const payload = JSON.stringify({ token }).replaceAll("<", "\\u003c");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Authorizing Decap CMS</title>
  </head>
  <body>
    <p>Authorizing Decap CMS...</p>
    <script>
      const expectedOrigin = ${JSON.stringify(expectedOrigin)};
      const payload = ${JSON.stringify(payload)};
      const receiveMessage = (event) => {
        if (event.origin !== expectedOrigin || event.source !== window.opener) {
          return;
        }

        window.opener.postMessage(
          \`authorization:github:success:\${payload}\`,
          expectedOrigin
        );
        window.removeEventListener("message", receiveMessage, false);
        window.close();
      };

      if (window.opener) {
        window.addEventListener("message", receiveMessage, false);
        window.opener.postMessage("authorizing:github", expectedOrigin);
      } else {
        document.body.textContent = "Unable to complete Decap authorization because the login window has no opener.";
      }
    </script>
  </body>
</html>`;
}

function htmlResponse(body: string, headers?: HeadersInit): Response {
  return new Response(body, {
    status: 200,
    headers: {
      ...headers,
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function textResponse(message: string, status: number, headers?: HeadersInit): Response {
  return new Response(message, {
    status,
    headers: {
      ...headers,
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function getCookie(request: Request, name: string): string | undefined {
  const cookieHeader = request.headers.get("cookie");

  if (!cookieHeader) {
    return undefined;
  }

  for (const cookie of cookieHeader.split(";")) {
    const [cookieName, ...cookieValueParts] = cookie.trim().split("=");

    if (cookieName === name) {
      return cookieValueParts.join("=");
    }
  }

  return undefined;
}

function clearStateCookie(secure: boolean): string {
  const parts = [
    `${stateCookieName}=`,
    "Path=/api/oauth",
    "Max-Age=0",
    "HttpOnly",
    "SameSite=Lax",
  ];

  if (secure) {
    parts.push("Secure");
  }

  return parts.join("; ");
}
