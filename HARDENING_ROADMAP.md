# Astro Azure SWA Hardening Roadmap

**Scope:** `@opsydyn/astro-azure-swa`, the `examples/basic` deployment, CI/CD, Azure infrastructure, package release, and supporting documentation.

**Created:** 2026-08-05
**Status:** In progress
**Owner:** Opsydyn

This roadmap turns the project assessment into a checkable progression from a working production proof to a releaseable, reproducible, and defensible adapter. It is deliberately separate from [`ROADMAP.md`](./ROADMAP.md), which records the historical product direction and earlier decisions.

## How to use this roadmap

Only check an item when its acceptance evidence is recorded. A code change, a green local command, or a successful upload by itself is not enough when the item concerns deployment, persistence, isolation, security, or release behaviour.

Status markers:

- `[ ]` TODO
- `[~]` IN PROGRESS
- `[x]` DONE
- `[!]` BLOCKED — record the blocker in the decision/evidence log

Priority markers:

- **P0** — release or production safety; do before the next published hardening release
- **P1** — important reliability, maintainability, or security improvement
- **P2** — enhancement or follow-up; does not block the hardened release

Workstream labels:

- `[repro]` reproducibility and developer workflow
- `[adapter]` published adapter and generated runtime
- `[ci]` CI/CD and release automation
- `[azure]` Azure Static Web Apps and Functions
- `[infra]` Terraform and cloud identity
- `[security]` supply-chain, credentials, and boundary controls
- `[docs]` documentation and package communication
- `[enhancement]` optional product and demonstration work

Every task should be completed with this record:

```md
- [ ] P0 [adapter] Short task name
  - Depends on: baseline gate
  - Acceptance: observable condition that must be true
  - Evidence: command, test, package inspection, deployment URL, or release link
  - Verified: —
```

## Current evidence baseline

This is an assessment snapshot, not a claim that every hardening item below is complete. Refresh drift-prone evidence before starting a release.

- [x] The adapter and high-fidelity example build successfully after dependencies are installed and the adapter is built first.
- [x] Vitest: 39/39 tests passed on 2026-08-05, including the runtime-manifest, package-contract, and workflow-contract coverage.
- [x] Typecheck, publint, AreTheTypesWrong, Knip, API docs validation, size-limit, and package dry-run passed on 2026-08-05.
- [x] The package entrypoint measured 2.89 kB Brotli against a 15 kB limit on 2026-08-05.
- [x] The documented production deployment returned 200 for the root, health endpoint, prerendered hybrid page, and Advanced Routing sample; an unknown route returned 404 on 2026-08-02.
- [x] The worktree was clean at assessment time.
- [x] A disposable clean-checkout invocation of the root `check` script passes after the adapter build is run first; the pre-fix archive reproduced the missing workspace `dist` export failure.
- [ ] A dependency vulnerability audit is still outstanding; the advisory-service request was not run because the environment rejected the required dependency-graph egress.
- [ ] Current package versions and live Azure behaviour must be refreshed before release because they are time-sensitive.

## Dependency map

```text
Phase 0: baseline and reproducibility
    ↓
Phase 1: adapter/runtime correctness
    ↓
Phase 2: CI/CD and release gates ─────┐
    ↓                                  │
Phase 3: Azure and infrastructure      │
    ↓                                  │
Phase 4: package and documentation ───┘
    ↓
Gate E: hardened release
    ↓
Phase 5: optional enhancements
```

Do not advance a gate merely because a downstream phase has code on a branch. The gate requires its evidence to be fresh and attached to the task.

## Phase 0 — Baseline and reproducibility

**Goal:** make the project’s quality signal deterministic from a clean checkout.

- [x] P0 `[repro]` Make the root `check` script clean-checkout safe by building the workspace adapter before example typechecking, or by using a supported workspace import path that does not require generated `dist` files.
  - Depends on: none
  - Acceptance: `bun install --frozen-lockfile` followed by `bun run check` passes from a checkout with build output removed.
  - Evidence: disposable archive `/var/folders/wv/3m5dhh6x5pv9w0fbfzymldnw0000gn/T/tmp.Xtaz27Dc1C`; `bun install --frozen-lockfile && env npm_config_cache=/private/tmp/astro-azure-npm-cache bun run check` exited 0 after 36 tests and the example build.
  - Verified: 2026-08-05

- [x] P0 `[repro]` Define the canonical quality command and make its order explicit: build, typecheck, unit/integration tests, example build/preview, package lint, Knip, API docs, size, and pack validation.
  - Depends on: clean-checkout-safe `check`
  - Acceptance: CI, release, and deployment workflows can invoke the same documented gate without duplicating hidden prerequisites.
  - Evidence: root `check` has the deterministic build → typecheck → test → example-build order; `.github/workflows/quality.yml` runs the complete matrix and CI, release, and Azure upload call it before their own work; the local matrix passed on 2026-08-05.
  - Verified: 2026-08-05

- [x] P1 `[repro]` Pin the Bun toolchain with a root `packageManager` declaration and a matching `oven-sh/setup-bun` version in workflows.
  - Depends on: none
  - Acceptance: local and CI runs report the same Bun version; no workflow uses `bun-version: latest`.
  - Evidence: root `packageManager: "bun@1.3.11"`; reusable quality, release, and Azure workflows use `bun-version: "1.3.11"`; no workflow uses `bun-version: latest`.
  - Verified: 2026-08-05

- [ ] P1 `[repro]` Add a disposable clean-install verification path that checks the worktree remains clean after build, tests, preview, pack, and documentation generation.
  - Depends on: canonical quality command
  - Acceptance: generated output is ignored or intentionally removed and source files are unchanged.
  - Evidence: `git status --short --branch` before and after the gate
  - Verified: —

- [ ] P1 `[repro]` Record the supported local prerequisites: Bun, Node, Azure SWA CLI, Terraform, Azure CLI, and the minimum versions required for each verification path.
  - Depends on: toolchain pinning
  - Acceptance: a new contributor can select the local-only, package, preview, or infrastructure path without guessing prerequisites.
  - Evidence: contributor documentation
  - Verified: —

### Phase 0 exit gate — Gate A: local quality

- [x] `bun install --frozen-lockfile` succeeds from a clean checkout.
- [x] The canonical quality command passes with zero errors and zero warnings where the tool supports warnings; the reusable workflow now invokes the full package-quality matrix.
- [x] The example preview suite can bind to loopback in the supported verification environment.
- [x] The worktree is clean after verification.

## Phase 1 — Adapter and generated-runtime correctness

**Goal:** ensure the published adapter emits a runtime that matches the consuming Astro project and the selected Azure runtime.

- [x] P0 `[adapter]` Resolve the consuming Astro version from the project manifest and use it in generated `api/package.json`; remove the Astro 6 fallback from the Astro 7 package.
  - Depends on: Gate A
  - Acceptance: generated runtime dependency matches supported consumer Astro major/minor policy; a missing or incompatible Astro dependency fails the build with an actionable error.
  - Evidence: `packages/astro-azure-swa/test/generate.test.ts` covers runtime and devDependency Astro 7 declarations, missing/malformed manifests, Astro 6 rejection, and generated `astro: "7.0.0"`; the basic example asserts the same emitted version.
  - Verified: 2026-08-05

- [x] P0 `[adapter]` Make project dependency discovery fail closed. Do not silently convert unreadable, malformed, or ambiguous `package.json` input into an empty runtime dependency set.
  - Depends on: Astro version resolution
  - Acceptance: the build reports the source path and reason when dependency resolution cannot be trusted.
  - Evidence: resolver failure-path tests assert actionable errors for missing Astro, Astro 6, malformed JSON, and the manifest path; workspace dependencies remain filtered and the adapter package is excluded.
  - Verified: 2026-08-05

- [~] P0 `[adapter]` Decide the Node runtime contract: retain both `node:20` and `node:22` with a Node 20-compatible package/build target; the CI matrix remains a Phase 2 follow-up.
  - Depends on: Gate A
  - Acceptance: `engines`, TypeScript/tsdown target, generated config, package dependencies, and test matrix agree.
  - Evidence: D-001 records the decision; `engines.node` is `>=20.0.0`, tsdown targets `node20`, the public type retains both runtime values, and the generated config tests cover node 20/22 selection. CI execution on both Node versions is not yet complete.
  - Verified: 2026-08-05 (implementation; CI pending)

- [ ] P1 `[adapter]` Generate a deterministic runtime dependency closure from the built server output, or document and enforce a narrowly defined alternative.
  - Depends on: Astro resolution and Node contract
  - Acceptance: runtime dependencies include every external server import and exclude build-only packages such as types and the adapter itself unless demonstrably required.
  - Evidence: generated manifest inspection, external-import test, and isolated install/run
  - Verified: —

- [ ] P1 `[adapter]` Define handling for `workspace:`, `catalog:`, `file:`, `link:`, optional, peer, and private package dependencies.
  - Depends on: dependency-closure design
  - Acceptance: each unsupported form fails with a clear remedy or is transformed into a deployable version.
  - Evidence: fixture matrix
  - Verified: —

- [ ] P1 `[adapter]` Add an isolated consumer smoke test: pack the adapter, install it into a temporary Astro app, build, inspect generated files, and execute the generated function entrypoint locally.
  - Depends on: dependency closure
  - Acceptance: the test does not import the adapter from the workspace source or rely on unpublished workspace links.
  - Evidence: isolated temporary project log
  - Verified: —

- [ ] P1 `[adapter]` Remove or centralise duplicated generated bridge templates so the normal bundled path and fallback path cannot drift.
  - Depends on: isolated consumer smoke test
  - Acceptance: one source of truth or a test that compares the generated fallback bridge with the published bridge behaviour.
  - Evidence: source review and bridge regression tests
  - Verified: —

- [ ] P1 `[adapter]` Expand bridge contract tests for request bodies, binary responses, multiple cookies, cookie attributes, redirects, empty responses, malformed cookie input, and original SWA URLs.
  - Depends on: none
  - Acceptance: all supported Azure response fields survive the Web Request/Web Response conversion.
  - Evidence: Vitest output and fixture list
  - Verified: —

### Phase 1 exit gate — Gate B: package and consumer

- [x] Adapter package builds and typechecks from a clean checkout.
- [x] `publint`, AreTheTypesWrong, Knip, API docs, size-limit, and pack dry-run pass.
- [ ] A packed isolated consumer builds and runs the generated function entrypoint.
- [x] Generated `api/package.json`, `host.json`, routing config, and server files are inspected as deployment artifacts.
- [ ] The selected Node/Astro compatibility matrix is green.

## Phase 2 — CI/CD and release gates

**Goal:** prevent a passing upload from being mistaken for a verified deployment or release.

- [~] P0 `[ci]` Create one reusable quality gate that release and deployment jobs must consume before publish/upload.
  - Depends on: Gate A and Gate B
  - Acceptance: a failing adapter test, example build, package check, or artifact verification prevents release and deployment.
  - Evidence: `.github/workflows/quality.yml`, workflow contract tests (3/3), and `needs: quality` in release and Azure upload; local matrix passed. A live required-status/failing-gate run is still pending.
  - Verified: 2026-08-05 (local; live CI pending)

- [~] P0 `[ci]` Make PR smoke tests use the Azure Static Web Apps preview URL returned by the deploy action rather than the hard-coded production hostname.
  - Depends on: reusable quality gate
  - Acceptance: a PR tests its own deployed commit; production smoke runs only for production deployment events.
  - Evidence: Azure workflow resolves a successful current-commit deployment `environment_url`, rejects non-HTTPS/missing preview URLs, and passes the selected base URL to `/api/health`; workflow contract tests assert production is absent from the smoke step. A live PR preview log is still pending.
  - Verified: 2026-08-05 (local; live preview pending)

- [ ] P0 `[ci]` Expand deployment smoke coverage to SSR, dynamic routing, prerendered content, API JSON, POST body handling, redirects, multiple cookies, 404 behaviour, middleware headers, and Advanced Routing.
  - Depends on: preview URL wiring
  - Acceptance: each route class has a status/body/header assertion and failures identify the route.
  - Evidence: smoke-test output and route matrix
  - Verified: —

- [ ] P1 `[ci]` Separate build artifact verification from deployment and retain an inspectable artifact manifest.
  - Depends on: canonical quality command
  - Acceptance: CI records expected files, generated dependency versions, config, and a checksum or equivalent identity for the uploaded output.
  - Evidence: workflow artifact or job summary
  - Verified: —

- [ ] P1 `[ci]` Pin all third-party GitHub Actions to verified full-length commit SHAs and document the update process.
  - Depends on: none
  - Acceptance: no production workflow uses mutable action tags without an explicit exception.
  - Evidence: workflow scan
  - Verified: —

- [ ] P1 `[ci]` Add workflow concurrency and environment protection rules for production deploy and publish operations.
  - Depends on: reusable quality gate
  - Acceptance: stale previews cancel safely; production publish/deploy has a protected environment and cannot overlap unexpectedly.
  - Evidence: workflow configuration and a dry-run event trace
  - Verified: —

- [ ] P1 `[ci]` Replace `NPM_TOKEN` release authentication with npm trusted publishing through GitHub OIDC.
  - Depends on: release workflow gate
  - Acceptance: publication succeeds without a long-lived npm write token and produces provenance.
  - Evidence: npm package provenance and release workflow log
  - Verified: —

- [ ] P1 `[ci]` Verify Changesets versioning, package publication, GitHub release, tag, and published-package install as one release acceptance path.
  - Depends on: npm trusted publishing
  - Acceptance: a release is not marked complete until all five artefacts exist and an isolated consumer can install the published version.
  - Evidence: Changesets output, npm page, GitHub tag/release, and consumer log
  - Verified: —

### Phase 2 exit gate — Gate C: Azure PR preview

- [ ] The preview deployment is tied to the PR commit under test.
- [ ] All route smoke checks pass against the preview URL.
- [ ] The preview environment is closed and its credentials are not exposed in logs.
- [ ] The quality gate is a required status check for merge.

## Phase 3 — Azure and infrastructure hardening

**Goal:** make cloud identity, state, deployment, and recovery safer and repeatable.

- [ ] P0 `[security]` Replace Terraform’s long-lived service-principal secret with Azure/GitHub OIDC federation.
  - Depends on: Phase 2 workflow controls
  - Acceptance: Terraform authenticates with short-lived identity tokens and no `ARM_CLIENT_SECRET` is required.
  - Evidence: successful plan/apply log and federated credential configuration
  - Verified: —

- [ ] P0 `[infra]` Apply least privilege to Terraform and deployment identities, separating plan, apply, state access, and SWA deployment roles where practical.
  - Depends on: OIDC migration
  - Acceptance: each identity has only the permissions needed by its workflow and environment.
  - Evidence: role-assignment export and workflow mapping
  - Verified: —

- [ ] P1 `[infra]` Make `infra/bootstrap.sh` idempotent and parameter-driven; remove hard-coded subscription and environment assumptions from the default path.
  - Depends on: none
  - Acceptance: rerunning bootstrap does not recreate identities or fail on existing state resources; project-specific values are supplied explicitly.
  - Evidence: two-run transcript in a disposable or documented test subscription
  - Verified: —

- [ ] P1 `[infra]` Protect production Terraform apply and deployment with an environment requiring review, while keeping PR plan read-only.
  - Depends on: OIDC and least privilege
  - Acceptance: pull requests cannot apply infrastructure or access production secrets.
  - Evidence: workflow permissions and protected-environment configuration
  - Verified: —

- [ ] P1 `[infra]` Make Terraform plan comments safe and useful: capture plan output through a file or environment boundary, avoid script interpolation of untrusted plan text, truncate predictably, and link to the full job log.
  - Depends on: protected PR plan
  - Acceptance: plans render correctly for normal and adversarial strings without executing injected script content.
  - Evidence: fixture PR or local actionlint/security review
  - Verified: —

- [ ] P1 `[azure]` Add deployment-time checks for runtime selection, function package dependencies, route configuration, placeholder handling, and API startup.
  - Depends on: Gate C
  - Acceptance: a missing external server dependency or invalid SWA config fails before or during smoke verification with a clear diagnosis.
  - Evidence: artifact verification output and failed-fixture coverage
  - Verified: —

- [ ] P2 `[azure]` Document operational recovery: deployment rollback, remote-state recovery, SWA preview cleanup, token rotation, and production smoke failure triage.
  - Depends on: protected production environment
  - Acceptance: an operator can follow the runbook without reconstructing the original post-mortems.
  - Evidence: reviewed runbook and tabletop walkthrough
  - Verified: —

### Phase 3 exit gate — Gate D: production deployment

- [ ] Production deployment uses protected identity and environment controls.
- [ ] Artifact verification passes before upload.
- [ ] Production route smoke passes against the production URL after deployment.
- [ ] Rollback and failure-triage instructions have been exercised.

## Phase 4 — Package and documentation readiness

**Goal:** make the published package and its public explanation match the hardened implementation.

- [ ] P0 `[docs]` Add the MIT licence file so the declared package file list and published tarball agree.
  - Depends on: none
  - Acceptance: `npm pack --dry-run` includes the licence and the package metadata is internally consistent.
  - Evidence: tarball contents
  - Verified: —

- [ ] P0 `[docs]` Update package README, root README, changelog guidance, and historical roadmap references from Astro 6 to the supported Astro 7 contract.
  - Depends on: Phase 1 runtime decision
  - Acceptance: installation, supported versions, generated output, local preview, and deployment instructions describe current behaviour.
  - Evidence: documentation review against a fresh build
  - Verified: —

- [ ] P1 `[docs]` Add a supported-version matrix covering Astro, Node, Bun, TypeScript, Azure Functions, and Azure SWA runtime selections.
  - Depends on: Node/Astro decision
  - Acceptance: the matrix distinguishes tested combinations from merely allowed ranges.
  - Evidence: matrix in package documentation and CI jobs
  - Verified: —

- [ ] P1 `[docs]` Add a package-release checklist covering Changesets, pack inspection, provenance, npm install, GitHub tag/release, and rollback notes.
  - Depends on: Gate E design
  - Acceptance: a release operator can check every external publication artefact.
  - Evidence: reviewed checklist linked from the release workflow
  - Verified: —

- [ ] P1 `[docs]` Move example-only type packages to devDependencies where they are not needed by the generated server runtime and document why each generated runtime dependency remains.
  - Depends on: dependency-closure design
  - Acceptance: generated API installation is smaller without removing any required server import.
  - Evidence: before/after manifest and isolated run
  - Verified: —

- [ ] P1 `[docs]` Link this roadmap from the root README and keep the historical `ROADMAP.md` clearly labelled as historical/product direction.
  - Depends on: this document
  - Acceptance: a new contributor can find the current hardening work from the repository entrypoint.
  - Evidence: documentation link check
  - Verified: —

### Phase 4 exit gate — Gate E: hardened release

- [ ] Package metadata, licence, README, changelog, and generated tarball agree.
- [ ] The supported-version matrix is green for the release target.
- [ ] The packed package works in an isolated consumer.
- [ ] npm provenance, published version, Git tag, GitHub release, and release notes all exist.
- [ ] Production smoke evidence is attached to the release record.

## Phase 5 — Optional enhancements after hardening

These items should not delay the hardened release unless a decision explicitly promotes them to a product requirement.

- [ ] P2 `[enhancement]` Run a streaming feasibility spike for request and response bodies, including Azure SWA managed-functions compatibility, back-pressure, headers, cancellation, and preview parity.
  - Depends on: Gate D
  - Acceptance: a documented go/no-go decision backed by a real Azure test, not only local Node behaviour.
  - Evidence: spike report and deployment URL/log
  - Verified: —

- [ ] P2 `[enhancement]` Add lightweight request observability: correlation/request ID propagation, structured error context, cold-start timing, and response-size metrics where Azure exposes them safely.
  - Depends on: Gate D
  - Acceptance: operators can correlate a failed smoke request with an application log without logging secrets or cookie contents.
  - Evidence: redacted production or preview trace
  - Verified: —

- [ ] P2 `[enhancement]` Add the Elysia request-stats dashboard demonstration, clearly documenting that in-memory state only survives warm Function instances.
  - Depends on: Gate C
  - Acceptance: the example visibly calls the API and explains warm-instance limitations.
  - Evidence: preview URL and browser/manual verification
  - Verified: —

- [ ] P2 `[enhancement]` Add a CRUD demonstration only after choosing and documenting the persistence boundary: intentionally ephemeral memory or an Azure-backed store.
  - Depends on: request observability and security review
  - Acceptance: the demo states its consistency, durability, authentication, and cleanup properties.
  - Evidence: preview route tests and storage runbook
  - Verified: —

- [ ] P2 `[enhancement]` Run performance and size baselines for cold start, warm request latency, generated API package size, and large response memory use.
  - Depends on: dependency closure and observability
  - Acceptance: baseline numbers have a repeatable command and a regression threshold.
  - Evidence: benchmark report
  - Verified: —

## Final release-readiness checklist

- [ ] Gate A — clean local quality is green.
- [ ] Gate B — packed adapter and isolated consumer are green.
- [ ] Gate C — PR preview route smoke is green.
- [ ] Gate D — production deployment and smoke are green.
- [ ] Gate E — publication, provenance, tag, release, and install verification are green.
- [ ] No P0 item is unchecked or blocked without an explicit owner decision.
- [ ] All live evidence is dated and linked.
- [ ] Known limitations are documented, including streaming status, runtime support, warm-instance state, and preview-environment exposure.
- [ ] `git status --short --branch` is clean after the final verification run.

## Decision and evidence log

| ID | Decision or evidence required | Owner | Status | Link/date |
| --- | --- | --- | --- | --- |
| D-001 | Node 20 support versus Node 22-only contract | Codex | Decided; CI pending | 2026-08-05: retain both `node:20` and `node:22`; publish Node `>=20.0.0`, emit a Node 20-compatible target, and carry the Node 20/22 CI matrix into the Phase 2 CI/CD plan. |
| D-002 | Generated runtime dependency closure strategy | — | Open | — |
| D-003 | npm trusted publisher configuration | — | Open | — |
| D-004 | Azure OIDC subject and least-privilege role model | — | Open | — |
| D-005 | Streaming go/no-go decision | — | Deferred | — |
| E-001 | Baseline local/package/live evidence refresh | — | Refresh before release | 2026-08-02 snapshot |
| E-002 | Dependency vulnerability audit | — | Outstanding | Environment egress restriction |
| E-003 | CI quality gate and PR preview smoke implementation | Codex | Local implementation verified; live evidence pending | 2026-08-05: YAML parsed, workflow contract 3/3, local quality matrix green; GitHub required-status and live PR preview run still required. |

## Deferred / explicitly out of scope

- Nitro, H3, or a second server framework in the adapter.
- A custom runtime layer beyond Astro’s renderer and the Azure Functions v4 bridge.
- Treating in-memory demo state as durable production storage.
- Claiming streaming support before Azure SWA managed-functions evidence exists.
- Treating a successful upload as proof that the deployed Function started correctly.
