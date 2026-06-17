# astro-azure-adapter

Monorepo for `@opsydyn/astro-azure-swa` — a native Astro 6 adapter for Azure Static Web Apps.

## Packages

- **[`@opsydyn/astro-azure-swa`](./packages/astro-azure-swa)** [![npm](https://img.shields.io/npm/v/@opsydyn/astro-azure-swa)](https://www.npmjs.com/package/@opsydyn/astro-azure-swa) — Astro adapter for Azure Static Web Apps

## Development

```bash
bun install
bun run build       # build the adapter
bun run dev         # build adapter + start example dev server
bun run typecheck   # type-check adapter and example
bun run test        # unit and integration tests
bun run lint        # publint + attw
bun run lint:knip   # unused exports check
```

## Example app

The [`examples/basic`](./examples/basic) app is a high-fidelity demo covering SSR, hybrid pre-rendering, middleware, Astro Actions, React client islands, server islands, redirects, cookies, auth flows, JSON APIs, and content collections with MDX.

```bash
bun run test:example                          # build the example
bun run --cwd examples/basic preview          # preview locally
```

For platform-fidelity testing with the Azure SWA CLI:

```bash
bun run test:example
cd examples/basic/dist/api && bun install && cd ../../..
bunx @azure/static-web-apps-cli start ./examples/basic/dist/client --api-location ./examples/basic/dist/api
```

## CI / CD

| Workflow                       | Trigger              | Purpose                                   |
| ------------------------------ | -------------------- | ----------------------------------------- |
| `ci.yml`                       | push + PR to `main`  | build, typecheck, lint, test, size-limit  |
| `release.yml`                  | push to `main`       | changesets version PR or npm publish      |
| `azure-static-web-apps.yml`    | push + PR to `main`  | deploy example to Azure SWA               |

Releases are managed with [changesets](https://github.com/changesets/changesets). To cut a release:

```bash
bun run changeset   # describe what changed
# commit and push — the release workflow opens a version PR
# merge the PR — the release workflow publishes to npm
```

## Repository structure

```text
packages/
  astro-azure-swa/    ← the published adapter package
examples/
  basic/              ← high-fidelity demo app (deployed to Azure)
tests/
  basic-build.test.ts ← end-to-end build + preview tests
docs/
  *.md                ← post-mortems and architecture notes
```
