# Decap CMS GitHub OAuth Sample Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a protected Decap CMS admin dashboard to `examples/basic` using Azure Static Web Apps auth for `/admin/*` and a same-app GitHub OAuth proxy for Decap's GitHub backend.

**Architecture:** The Decap dashboard is served as static files from `examples/basic/public/admin`, so Azure Static Web Apps route rules can protect it before `navigationFallback` is considered. The OAuth proxy is implemented as two Astro API routes under `/api/oauth`, using GitHub's OAuth code exchange and Decap's popup `postMessage` contract. Existing end-to-end build coverage is extended to verify admin assets, route order, and OAuth error behavior.

**Tech Stack:** Astro 6, `@opsydyn/astro-azure-swa`, Azure Static Web Apps route config, Decap CMS 3.14.1, Decap local backend server 3.9.1, GitHub OAuth, Bun, Vitest.

---

## File Structure

- Modify `tests/basic-build.test.ts`: extend the existing example build test so it fails until admin assets, SWA route config, and OAuth routes exist.
- Modify `examples/basic/astro.config.ts`: add the `/admin/*` SWA auth route through `staticWebAppConfig.routes`.
- Create `examples/basic/public/admin/index.html`: static Decap dashboard entrypoint.
- Create `examples/basic/public/admin/config.yml`: Decap GitHub backend config for the sample `blog` content collection.
- Create `examples/basic/src/pages/api/oauth/auth.ts`: start GitHub OAuth for Decap.
- Create `examples/basic/src/pages/api/oauth/callback.ts`: exchange GitHub code for a token and post it back to Decap.
- Modify `examples/basic/package.json`: add a `cms` script and `decap-server` dev dependency.
- Modify `bun.lock`: update through `bun add --cwd examples/basic --dev decap-server@3.9.1`.
- Create `examples/basic/README.md`: document the admin route, local CMS flow, GitHub OAuth app, SWA settings, and permissions model.
- Modify `.github/workflows/azure-static-web-apps.yml`: include admin files in the deploy artifact verification.

---

### Task 1: Add Decap Admin Asset Coverage

**Files:**
- Modify: `tests/basic-build.test.ts`

- [ ] **Step 1: Write the failing assertions for admin output**

In `tests/basic-build.test.ts`, inside the main test after the existing `staticwebapp.config.json` existence assertion, add:

```ts
    expect(existsSync(join(distDir, "client", "admin", "index.html"))).toBe(true);
    expect(existsSync(join(distDir, "client", "admin", "config.yml"))).toBe(true);
```

- [ ] **Step 2: Write the failing preview assertions for Decap static files**

In the same test, after `await startPreview();`, add:

```ts
    await expectText("/admin/", 200, "Decap CMS");
    await expectText("/admin/config.yml", 200, "name: github");
```

- [ ] **Step 3: Run the focused test and verify it fails**

Run:

```bash
bunx vitest run tests/basic-build.test.ts
```

Expected: FAIL because `dist/client/admin/index.html` does not exist.

- [ ] **Step 4: Leave the failing test uncommitted**

Do not commit yet. Task 2 adds the admin files and commits this test with the passing implementation.

---

### Task 2: Add Static Decap Admin Files

**Files:**
- Create: `examples/basic/public/admin/index.html`
- Create: `examples/basic/public/admin/config.yml`

- [ ] **Step 1: Create the Decap dashboard HTML**

Create `examples/basic/public/admin/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex" />
    <title>Decap CMS - Azure SWA Astro Adapter</title>
    <link href="/admin/config.yml" type="text/yaml" rel="cms-config-url" />
  </head>
  <body>
    <script src="https://unpkg.com/decap-cms@3.14.1/dist/decap-cms.js"></script>
  </body>
</html>
```

- [ ] **Step 2: Create the Decap config**

Create `examples/basic/public/admin/config.yml`:

```yaml
local_backend: true

backend:
  name: github
  repo: opsydyn/astro-azure-integration
  branch: main
  base_url: https://blue-wave-00d0bf30f.7.azurestaticapps.net
  auth_endpoint: api/oauth/auth

media_folder: examples/basic/public/uploads
public_folder: /uploads

collections:
  - name: blog
    label: Blog
    label_singular: Blog post
    folder: examples/basic/src/content/blog
    create: true
    extension: mdx
    format: frontmatter
    slug: "{{slug}}"
    identifier_field: title
    summary: "{{title}}"
    fields:
      - { label: Title, name: title, widget: string }
      - { label: Description, name: description, widget: text }
      - { label: Publication date, name: pubDate, widget: datetime }
      - { label: Author, name: author, widget: string, default: Alan Currie }
      - label: Tags
        name: tags
        widget: list
        default: []
        field: { label: Tag, name: tag, widget: string }
      - { label: Draft, name: draft, widget: boolean, default: false }
      - { label: Body, name: body, widget: markdown }
```

- [ ] **Step 3: Run the focused test and verify it passes**

Run:

```bash
bunx vitest run tests/basic-build.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit static admin files and tests**

```bash
git add tests/basic-build.test.ts examples/basic/public/admin/index.html examples/basic/public/admin/config.yml
git commit -m "feat(example): add decap admin files"
```

---

### Task 3: Protect `/admin/*` in the Generated SWA Config

**Files:**
- Modify: `tests/basic-build.test.ts`
- Modify: `examples/basic/astro.config.ts`

- [ ] **Step 1: Write the failing route order assertion**

In `tests/basic-build.test.ts`, replace the existing SWA config route assertions:

```ts
    expect(config.routes[0].route).toBe("/_astro/*");
    expect(config.routes[1]).toEqual({
      route: "/",
      rewrite: "/api/server",
    });
```

with:

```ts
    expect(config.routes[0].route).toBe("/_astro/*");
    expect(config.routes[1]).toEqual({
      route: "/admin/*",
      allowedRoles: ["authenticated"],
    });
    expect(config.routes[2]).toEqual({
      route: "/",
      rewrite: "/api/server",
    });
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
bunx vitest run tests/basic-build.test.ts
```

Expected: FAIL because the generated routes still put `/` at `config.routes[1]`.

- [ ] **Step 3: Add the admin route rule**

Replace the adapter block in `examples/basic/astro.config.ts`:

```ts
  adapter: azureSwa({
    apiRuntime: "node:22",
  }),
```

with:

```ts
  adapter: azureSwa({
    apiRuntime: "node:22",
    staticWebAppConfig: {
      routes: [
        {
          route: "/admin/*",
          allowedRoles: ["authenticated"],
        },
      ],
    },
  }),
```

- [ ] **Step 4: Run the focused test and verify route assertions pass**

Run:

```bash
bunx vitest run tests/basic-build.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the SWA admin route and test**

```bash
git add tests/basic-build.test.ts examples/basic/astro.config.ts
git commit -m "feat(example): protect decap admin route"
```

---

### Task 4: Implement Same-App GitHub OAuth Routes

**Files:**
- Modify: `tests/basic-build.test.ts`
- Create: `examples/basic/src/pages/api/oauth/auth.ts`
- Create: `examples/basic/src/pages/api/oauth/callback.ts`

- [ ] **Step 1: Write the failing OAuth preview assertions**

In `tests/basic-build.test.ts`, after the `/admin/config.yml` preview assertion, add:

```ts
    await expectText(
      "/api/oauth/auth?provider=github",
      500,
      "Missing GITHUB_OAUTH_CLIENT_ID",
    );
    await expectText(
      "/api/oauth/callback?provider=github",
      400,
      "Missing GitHub OAuth code",
    );
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
bunx vitest run tests/basic-build.test.ts
```

Expected: FAIL because the OAuth routes return 404.

- [ ] **Step 3: Create the OAuth auth route**

Create `examples/basic/src/pages/api/oauth/auth.ts`:

```ts
import type { APIRoute } from "astro";

const githubAuthorizeUrl = "https://github.com/login/oauth/authorize";

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

  authorizeUrl.searchParams.set("client_id", clientId);
  authorizeUrl.searchParams.set("redirect_uri", callbackUrl.toString());
  authorizeUrl.searchParams.set("scope", repoIsPrivate ? "repo,user" : "public_repo,user");
  authorizeUrl.searchParams.set("state", crypto.randomUUID());

  return new Response(null, {
    status: 302,
    headers: {
      location: authorizeUrl.toString(),
      "cache-control": "no-store",
    },
  });
};

function textResponse(message: string, status: number): Response {
  return new Response(message, {
    status,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
```

- [ ] **Step 4: Create the OAuth callback route**

Create `examples/basic/src/pages/api/oauth/callback.ts`:

```ts
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
```

- [ ] **Step 5: Run typecheck for the example**

Run:

```bash
bun run --cwd examples/basic typecheck
```

Expected: PASS.

- [ ] **Step 6: Run the focused test and verify it passes**

Run:

```bash
bunx vitest run tests/basic-build.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit OAuth routes and tests**

```bash
git add tests/basic-build.test.ts examples/basic/src/pages/api/oauth/auth.ts examples/basic/src/pages/api/oauth/callback.ts
git commit -m "feat(example): add decap github oauth routes"
```

---

### Task 5: Add Local CMS Dependency and Script

**Files:**
- Modify: `examples/basic/package.json`
- Modify: `bun.lock`

- [ ] **Step 1: Add `decap-server` with Bun**

Run:

```bash
bun add --cwd examples/basic --dev decap-server@3.9.1
```

Expected: `examples/basic/package.json` gains `decap-server` in `devDependencies`, and `bun.lock` is updated.

- [ ] **Step 2: Add the local CMS script**

In `examples/basic/package.json`, update the `scripts` block from:

```json
  "scripts": {
    "build": "astro build",
    "dev": "astro dev",
    "preview": "astro preview",
    "sync": "astro sync",
    "typecheck": "astro check"
  },
```

to:

```json
  "scripts": {
    "build": "astro build",
    "cms": "decap-server",
    "dev": "astro dev",
    "preview": "astro preview",
    "sync": "astro sync",
    "typecheck": "astro check"
  },
```

- [ ] **Step 3: Verify the script is registered**

Run:

```bash
bun run --cwd examples/basic cms --help
```

Expected: PASS with Decap server CLI help output.

- [ ] **Step 4: Run example typecheck**

Run:

```bash
bun run --cwd examples/basic typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit local CMS tooling**

```bash
git add examples/basic/package.json bun.lock
git commit -m "chore(example): add decap local backend script"
```

---

### Task 6: Document the Sample Admin Flow

**Files:**
- Create: `examples/basic/README.md`

- [ ] **Step 1: Create the example README**

Create `examples/basic/README.md`:

````md
# Basic Azure SWA Astro Example

This example exercises `@opsydyn/astro-azure-swa` with SSR pages, prerendered content, API routes, middleware, client islands, server islands, Astro Actions, and a protected Decap CMS dashboard.

## Decap CMS Admin

The dashboard is served from `/admin/` as static files in `public/admin`. The adapter merges this route rule into `staticwebapp.config.json`:

```ts
{
  route: "/admin/*",
  allowedRoles: ["authenticated"],
}
```

Azure Static Web Apps authentication controls who can load the dashboard. Decap's GitHub backend still performs GitHub OAuth before it can read or write repository content.

## Local CMS Development

Run Astro and Decap's local backend in separate terminals:

```bash
bun run --cwd examples/basic dev
bun run --cwd examples/basic cms
```

Then open:

```text
http://localhost:4321/admin/
```

With `local_backend: true`, Decap writes through `decap-server` to the local checkout.

## Production GitHub OAuth

Create a GitHub OAuth app for the deployed Static Web App.

- Homepage URL: `https://blue-wave-00d0bf30f.7.azurestaticapps.net`
- Authorization callback URL: `https://blue-wave-00d0bf30f.7.azurestaticapps.net/api/oauth/callback`

Add these Azure Static Web Apps application settings with the values from the GitHub OAuth app:

```text
GITHUB_OAUTH_CLIENT_ID
GITHUB_OAUTH_CLIENT_SECRET
```

If the target repository is private, also set:

```text
GITHUB_REPO_PRIVATE=1
```

The Decap config in `public/admin/config.yml` points at `opsydyn/astro-azure-integration` on `main`. Editors must have write access to that GitHub repository for Decap commits to succeed.
````

- [ ] **Step 2: Run markdown-free verification through the normal example checks**

Run:

```bash
bun run --cwd examples/basic typecheck
```

Expected: PASS.

- [ ] **Step 3: Commit documentation**

```bash
git add examples/basic/README.md
git commit -m "docs(example): document decap cms admin"
```

---

### Task 7: Update Deploy Artifact Verification

**Files:**
- Modify: `.github/workflows/azure-static-web-apps.yml`

- [ ] **Step 1: Verify admin artifacts in CI before deploy**

In `.github/workflows/azure-static-web-apps.yml`, inside the `Verify deploy artifacts` run block, after:

```yaml
          test -f examples/basic/dist/client/staticwebapp.config.json
```

add:

```yaml
          test -f examples/basic/dist/client/admin/index.html
          test -f examples/basic/dist/client/admin/config.yml
          grep -q '"/admin/*"' examples/basic/dist/client/staticwebapp.config.json
```

- [ ] **Step 2: Run the complete repository check**

Run:

```bash
bun run check
```

Expected: PASS.

- [ ] **Step 3: Commit CI verification**

```bash
git add .github/workflows/azure-static-web-apps.yml
git commit -m "ci: verify decap admin deploy artifacts"
```

---

## Final Verification

- [ ] **Step 1: Inspect final history**

Run:

```bash
git log --oneline -8
```

Expected: shows the task commits in order, ending with `ci: verify decap admin deploy artifacts`.

- [ ] **Step 2: Confirm clean working tree**

Run:

```bash
git status --short
```

Expected: no output.

- [ ] **Step 3: Record manual deployment follow-up**

Do not mark production OAuth verified until these manual deployment checks pass:

1. Configure the GitHub OAuth app with callback `https://blue-wave-00d0bf30f.7.azurestaticapps.net/api/oauth/callback`.
2. Add `GITHUB_OAUTH_CLIENT_ID` and `GITHUB_OAUTH_CLIENT_SECRET` to SWA app settings.
3. Visit `https://blue-wave-00d0bf30f.7.azurestaticapps.net/admin/` signed out and confirm SWA requires authentication.
4. Sign in through SWA auth and confirm Decap loads.
5. Click GitHub login and confirm the popup closes after OAuth.
6. Create a test blog entry and confirm GitHub receives the expected commit.

---

## Self-Review Notes

- The plan covers every design goal: protected static admin assets, GitHub OAuth proxy, local backend support, documentation, and verification.
- The plan intentionally avoids adapter package changes because the existing adapter already merges `staticWebAppConfig.routes`.
- The Decap OAuth callback uses the known external OAuth popup contract: first post `authorizing:github`, then respond to the opener handshake with `authorization:github:success:{"token":"..."}`.
- The committed `base_url` is the deployed sample origin currently used by `.github/workflows/azure-static-web-apps.yml`.
