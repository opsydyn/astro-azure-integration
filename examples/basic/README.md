# Basic Azure SWA Astro Example

This example exercises `@opsydyn/astro-azure-swa` with SSR pages, prerendered content, API routes, middleware, client islands, server islands, Astro Actions, and a protected Decap CMS dashboard.

## Astro 7 Advanced Routing + Elysia

`src/fetch.ts` exports an Elysia app as the project's Advanced Routing entry
point (Astro 7's `Fetchable` convention). It handles `/api/edge/*` directly,
before Astro's own router runs, and falls through to `astro(new
FetchState(request))` for every other path — which is the same handler Astro
uses when no `src/fetch.ts` is present, so all other routes behave exactly as
they did before this file existed.

This is a different integration style from `src/pages/api/elysia/[...slugs].ts`,
which mounts Elysia *inside* an Astro endpoint (`/api/elysia/*`). The two
demos are kept side by side intentionally:

| Route | Integration style | Astro middleware runs? |
|---|---|---|
| `/api/elysia/*` | Elysia mounted inside an Astro API endpoint | Yes |
| `/api/edge/*` | Elysia as the top-level `src/fetch.ts` handler | No — handled before Astro's router |

## Decap CMS Admin

The dashboard is served from `/admin/` as static files in `public/admin`. The adapter merges this route rule into `staticwebapp.config.json`:

```ts
{
  route: "/admin/*",
  allowedRoles: ["authenticated"],
}
```

Azure Static Web Apps authentication controls who can load the dashboard. The `authenticated` role means any SWA-authenticated user can load `/admin/`; Decap's GitHub backend still performs GitHub OAuth, and GitHub repository permissions still gate content reads and writes.

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

If you deploy your own copy, use your own deployed Static Web App origin for both GitHub OAuth URLs and update `backend.base_url` in `public/admin/config.yml` to that same origin.

Add these Azure Static Web Apps application settings with the values from the GitHub OAuth app:

```text
GITHUB_OAUTH_CLIENT_ID=<client-id>
GITHUB_OAUTH_CLIENT_SECRET=<client-secret>
```

If the target repository is private, also set:

```text
GITHUB_REPO_PRIVATE=1
```

Then change `backend.auth_scope` in `public/admin/config.yml` from `public_repo` to `repo`.

The Decap config in `public/admin/config.yml` points at `opsydyn/astro-azure-integration` on `main`. Editors must have write access to that GitHub repository for Decap commits to succeed.
