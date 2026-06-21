import type { APIRoute } from "astro";

const githubAccessTokenUrl = "https://github.com/login/oauth/access_token";

type GitHubTokenResponse = {
  access_token?: string;
  error?: string;
  error_description?: string;
};

export const GET: APIRoute = async ({ request }) => {
  const url = new URL(request.url);
  const provider = url.searchParams.get("provider") ?? "github";
  const code = url.searchParams.get("code");

  if (provider !== "github") {
    return textResponse("Unsupported OAuth provider", 400);
  }

  if (!code) {
    return textResponse("Missing GitHub OAuth code", 400);
  }

  const clientId = process.env.GITHUB_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GITHUB_OAUTH_CLIENT_SECRET;

  if (!clientId) {
    return textResponse("Missing GITHUB_OAUTH_CLIENT_ID", 500);
  }

  if (!clientSecret) {
    return textResponse("Missing GITHUB_OAUTH_CLIENT_SECRET", 500);
  }

  const callbackUrl = new URL("/api/oauth/callback", url.origin);
  const tokenResponse = await fetch(githubAccessTokenUrl, {
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

  let tokenJson: GitHubTokenResponse;

  try {
    tokenJson = (await tokenResponse.json()) as GitHubTokenResponse;
  } catch {
    return textResponse("GitHub OAuth token exchange returned invalid JSON", 502);
  }

  if (!tokenResponse.ok || tokenJson.error) {
    return textResponse(
      tokenJson.error_description ?? tokenJson.error ?? "GitHub OAuth token exchange failed",
      502,
    );
  }

  if (!tokenJson.access_token) {
    return textResponse("GitHub OAuth token exchange did not return an access token", 502);
  }

  return htmlResponse(createCallbackHtml(tokenJson.access_token));
};

function createCallbackHtml(token: string): string {
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
      const payload = ${JSON.stringify(payload)};
      const receiveMessage = () => {
        window.opener.postMessage(
          \`authorization:github:success:\${payload}\`,
          "*"
        );
        window.removeEventListener("message", receiveMessage, false);
        window.close();
      };

      if (window.opener) {
        window.addEventListener("message", receiveMessage, false);
        window.opener.postMessage("authorizing:github", "*");
      } else {
        document.body.textContent = "Unable to complete Decap authorization because the login window has no opener.";
      }
    </script>
  </body>
</html>`;
}

function htmlResponse(body: string): Response {
  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
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
