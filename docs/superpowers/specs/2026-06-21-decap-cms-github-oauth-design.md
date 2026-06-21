# Decap CMS GitHub OAuth Sample Design

## Context

The `examples/basic` app is the adapter's broad smoke test for Astro 6 on Azure Static Web Apps. It already exercises SSR routes, prerendered content collection pages, middleware, API routes, React islands, and the adapter's generated `staticwebapp.config.json`.

This design adds a deployable Decap CMS dashboard to that sample app while preserving the adapter's current configuration model. The adapter README documents `staticWebAppConfig.routes` passthrough, including the target `/admin/*` role gate:

```ts
routes: [
  {
    route: "/admin/*",
    allowedRoles: ["authenticated"],
  },
]
```

Decap CMS is a static browser application served from `/admin`. Its GitHub backend can read and write repository content through GitHub APIs, but GitHub OAuth requires a server-side secret exchange. On Azure Static Web Apps, that proxy should live in the existing Astro serverless function path.

## Goals

- Add a protected Decap CMS dashboard to `examples/basic`.
- Demonstrate that adapter consumers can protect static admin files with `staticWebAppConfig.routes`.
- Use Decap's GitHub backend for deployable editing on free Azure Static Web Apps.
- Keep the sample small by wiring only the existing `blog` content collection.
- Keep local development possible with Decap's local backend.
- Avoid changes to the adapter package unless the sample exposes a missing adapter capability.

## Non-Goals

- Do not build a generic Decap integration package.
- Do not add Netlify Identity or Git Gateway.
- Do not require Azure Static Web Apps Standard features.
- Do not add database-backed content storage.
- Do not model every content type in the sample.
- Do not make content edits publish without GitHub permissions. With Decap's GitHub backend, editors must have write access to the target repository.

## Recommended Approach

Use a same-app GitHub OAuth proxy and Decap's `github` backend.

This is the lightest deployable option for free SWA because it uses the serverless function capability the adapter already provides. SWA protects `/admin/*`; Decap then performs GitHub OAuth when it needs repository access. These are separate layers:

- SWA authentication controls who can load the admin dashboard.
- GitHub OAuth controls who can read and write repository content through Decap.

## Alternatives Considered

### Local-only Decap demo

This would add `public/admin/index.html`, `public/admin/config.yml`, `local_backend: true`, and a `decap-server` script. It is useful for development but does not prove the sample can run as a deployable CMS on SWA.

### Netlify Identity and Git Gateway

This reduces direct GitHub access requirements for editors, but it depends on Netlify services and weakens the Azure Static Web Apps story.

### Separate OAuth service

A separate Cloudflare Worker, Vercel function, or small Node service could handle OAuth. That works, but it adds deployment surface area and makes the sample less useful for adapter users who want to stay inside SWA.

## Architecture

### Static Admin Files

Create:

- `examples/basic/public/admin/index.html`
- `examples/basic/public/admin/config.yml`

`index.html` loads Decap CMS from the public CDN, following Decap's documented static install path. The HTML includes `noindex` and a `cms-config-url` link to `config.yml`.

`config.yml` defines:

- `local_backend: true` for local development
- `backend.name: github`
- `backend.repo` pointing to this repository
- `backend.branch: main`
- `backend.base_url` pointing at the deployed site origin
- `backend.auth_endpoint: api/oauth/auth`
- a single `blog` folder collection mapped to `src/content/blog`
- fields matching `examples/basic/src/content.config.ts`

The blog collection fields should be:

- `title`: string
- `description`: string
- `pubDate`: datetime
- `author`: string, defaulting to `Alan Currie`
- `tags`: list of strings
- `draft`: boolean, defaulting to `false`
- `body`: markdown

### SWA Route Protection

Modify `examples/basic/astro.config.ts` to pass:

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

The admin dashboard must live under `public/admin` so requests match real static files. This matters because Azure Static Web Apps does not apply route rules to requests that reach `navigationFallback`. The `/admin/*` route rule should protect actual static files emitted to `dist/client/admin`.

### OAuth API Routes

Create Astro API routes:

- `examples/basic/src/pages/api/oauth/auth.ts`
- `examples/basic/src/pages/api/oauth/callback.ts`

`auth.ts` initiates GitHub OAuth:

- Read `GITHUB_OAUTH_CLIENT_ID`.
- Build a GitHub authorize URL.
- Include `client_id`.
- Include `scope=repo`.
- Include a state value.
- Redirect to `https://github.com/login/oauth/authorize`.

`callback.ts` completes the OAuth flow:

- Read `code` and `state` from the request URL.
- Read `GITHUB_OAUTH_CLIENT_ID` and `GITHUB_OAUTH_CLIENT_SECRET`.
- Exchange the code at `https://github.com/login/oauth/access_token`.
- Request JSON with `Accept: application/json`.
- Return a tiny HTML page that calls `window.opener.postMessage(...)` with the token payload expected by Decap, then closes the popup.

The OAuth routes run through the adapter's normal serverless function. They should be plain Astro `APIRoute` files to keep the sample familiar.

### Environment Variables

Required production app settings:

- `GITHUB_OAUTH_CLIENT_ID`
- `GITHUB_OAUTH_CLIENT_SECRET`

The Decap config is a static file, so `backend.base_url` must be committed as the deployed SWA origin for a real deployment or documented as the one value sample users must replace.

The GitHub OAuth application callback URL must be:

```text
https://<swa-domain>/api/oauth/callback
```

### Local Development

Add a local CMS script to `examples/basic/package.json`:

```json
"cms": "decap-server"
```

Local editing flow:

1. Run `bun run --cwd examples/basic dev`.
2. Run `bun run --cwd examples/basic cms`.
3. Open `http://localhost:4321/admin/`.

When local backend mode is active, Decap writes to the local repository through `decap-server`.

### Documentation

Update sample documentation, preferably `examples/basic/README.md` if present, otherwise add it. The docs should explain:

- What `/admin/` demonstrates.
- Why SWA auth and GitHub OAuth are both present.
- Required GitHub OAuth app settings.
- Required SWA app settings.
- Local development commands.
- The limitation that GitHub backend editors need repository write access.

## Data Flow

### Admin Page Load

1. Browser requests `/admin/`.
2. Azure Static Web Apps evaluates the `/admin/*` route.
3. Anonymous users are rejected by SWA auth.
4. Authenticated users receive `admin/index.html`.
5. Decap loads `admin/config.yml`.

### GitHub Login

1. Editor clicks Decap's GitHub login.
2. Decap opens a popup at `<base_url>/api/oauth/auth`.
3. The auth route redirects to GitHub OAuth.
4. GitHub redirects back to `/api/oauth/callback`.
5. The callback route exchanges the code for a token.
6. The callback HTML posts the token to the Decap window.
7. Decap uses the token against GitHub APIs.

### Content Editing

1. Decap reads MDX entries from `src/content/blog`.
2. Editor creates or updates content.
3. Decap commits changes to `main` through GitHub APIs.
4. The repository's normal SWA deployment pipeline rebuilds the site.

## Error Handling

- Missing OAuth environment variables should produce clear `500` responses from the OAuth routes.
- Missing `code` in the callback should produce a clear `400`.
- GitHub token exchange failures should return a clear `502` with no secret values.
- The callback HTML should handle the absence of `window.opener` by rendering a short failure message.
- The sample docs should call out that SWA auth protects the dashboard shell, but GitHub permissions control repository writes.

## Testing Strategy

### Static Build Verification

Run:

```bash
bun run --cwd examples/basic build
```

Verify:

- `dist/client/admin/index.html` exists.
- `dist/client/admin/config.yml` exists.
- `dist/client/staticwebapp.config.json` contains `/admin/*` before the generated `/` route.
- `dist/client/staticwebapp.config.json` keeps the generated `navigationFallback`.

### Adapter Regression Verification

Run:

```bash
bun run test
```

The existing adapter tests already cover merging custom `staticWebAppConfig.routes`. No adapter test is required unless implementation changes package behavior.

### Type Checking

Run:

```bash
bun run --cwd examples/basic typecheck
```

The OAuth API routes must typecheck as Astro `APIRoute` modules.

### Manual OAuth Verification

After deployment:

1. Visit `/admin/` while signed out.
2. Confirm SWA requires authentication.
3. Sign in.
4. Confirm Decap loads.
5. Click GitHub login.
6. Confirm GitHub OAuth completes and the popup closes.
7. Create a draft or test blog entry.
8. Confirm the repository receives the expected commit or pull request.

## Open Questions

- The implementation must confirm the exact Decap popup `postMessage` token shape against Decap's current GitHub backend behavior before writing the callback route.
- The repository slug in `config.yml` should be set to the public repository that will host this sample at deployment time. For this workspace, the current `origin` remote is `opsydyn/astro-azure-integration`, but implementation should verify whether the repository is being renamed before hard-coding it.

## References

- Decap install docs: https://decapcms.org/docs/install-decap-cms/
- Decap configuration docs: https://decapcms.org/docs/configure-decap-cms/
- Decap GitHub backend docs: https://decapcms.org/docs/github-backend/
- Decap backend OAuth proxy overview: https://decapcms.org/docs/backends-overview/
- Astro Decap CMS guide: https://docs.astro.build/en/guides/cms/decap-cms/
- Azure Static Web Apps auth docs: https://learn.microsoft.com/en-us/azure/static-web-apps/authentication-authorization
- Azure Static Web Apps configuration docs: https://learn.microsoft.com/en-us/azure/static-web-apps/configuration
