# CI Quality Gate and Pull-Request Preview Smoke Design

**Status:** Approved design
**Date:** 2026-08-05
**Scope:** Phase 2 slice 1 of `HARDENING_ROADMAP.md`

## Context

The first hardening slice made the local quality signal reproducible: the root
`check` command builds the adapter before checking the example, the Bun version
is declared as `1.3.11`, and the generated runtime is fail-closed for Astro 7.

The CI and deployment workflows still carry separate copies of the quality
sequence. They also use `bun-version: latest`. The Azure workflow runs the same
production URL smoke test for every successful upload, including pull requests,
so a PR can report green while testing an unrelated production deployment.

## Goals

1. Provide one reusable quality gate that CI, release, and Azure deployment jobs
   must consume before their own work.
2. Make every workflow use the repository's pinned Bun version.
3. Run pull-request smoke tests against the preview deployment created for the
   commit under test, and fail closed if that URL cannot be resolved.
4. Preserve production smoke testing for pushes to the production branch.
5. Keep the slice locally verifiable without requiring Azure credentials.

## Non-goals

- Pinning every third-party action to a full commit SHA; that is slice 2.
- Replacing the current Azure Static Web Apps deployment action.
- Implementing npm trusted publishing or release provenance changes; those are
  slice 2.
- Expanding the smoke suite beyond the existing `/api/health` deployment check;
  the broader route matrix remains a separate Phase 2 task.
- Sharing build artifacts between the reusable gate and downstream jobs. Each
  caller will rebuild its own output so this slice does not introduce artifact
  retention or cross-job packaging semantics.

## Architecture

### Reusable quality workflow

Create `.github/workflows/quality.yml` as a local reusable workflow with
`workflow_call`. It has one quality job and no deployment credentials. The job
will:

1. check out the repository;
2. install Bun `1.3.11` and dependencies with `bun install --frozen-lockfile`;
3. run `bun run check` (build, typecheck, tests, and example build);
4. run package lint and AreTheTypesWrong through `bun run lint`;
5. run Knip;
6. run API documentation validation;
7. run the size limit; and
8. run the package dry-run.

`ci.yml` will call this workflow directly. The release job and the Azure
`build_and_deploy` job will call it as a prerequisite with `needs: quality`.
The Azure close-pull-request job remains independent because it only tears down
the preview environment. Downstream jobs intentionally rebuild after the gate;
the reusable workflow is the shared contract, not an artifact transport layer.

### Pull-request deployment URL resolution

The Azure upload step will retain its PR deployment integration and receive an
explicit step id. On pull-request events, a following GitHub Script step will
query deployments for the current commit and inspect their statuses for a
successful `environment_url`. It will expose the selected URL as a step output.

The smoke step will choose its base URL by event type:

- `pull_request`: the resolved successful preview `environment_url`; fail if no
  current-commit preview URL exists;
- `push` to `main` or `master`: the existing production URL.

The production URL will not be used on the pull-request branch of the workflow.
The health smoke loop will continue to retry startup, but its request will be
constructed from the selected base URL and will report that target in failure
output.

The workflow will grant only the permissions needed for this path: repository
contents read, deployment status read, and pull-request write for the existing
Azure action integration.

## Failure handling

- A quality-gate failure prevents release or deployment jobs from starting.
- A missing preview deployment or missing successful `environment_url` fails the
  PR job with the commit and lookup context; it never falls back to production.
- A preview health timeout prints the resolved target and the last response
  body, then exits non-zero.
- Push smoke failures continue to identify the production route and response.

## Verification and evidence

Local verification will include:

- YAML parsing for every workflow file;
- static assertions for the Bun pin, reusable-workflow calls, `needs: quality`,
  preview URL lookup, and the absence of the production URL from the PR smoke
  branch;
- `git diff --check`;
- the full local `bun run check` and package-quality matrix; and
- a clean worktree after generated output is produced.

The repository cannot prove a live PR preview from a local checkout without the
Azure deployment secret. The roadmap item for live preview smoke will remain
pending until a real pull request workflow records the preview URL and health
result.

## Operational trade-off

The reusable gate adds a second install/build on deployment and release runs,
but it makes the required quality contract explicit and prevents a workflow
from silently omitting a check. Artifact reuse can be considered in a later
optimization after the gate and deployment evidence are stable.

## References

- GitHub's Azure Static Web Apps workflow guidance: <https://docs.github.com/en/actions/how-tos/deploy/deploy-to-third-party-platforms/azure-static-web-app>
- Azure Static Web Apps Deploy action: <https://github.com/Azure/static-web-apps-deploy>
