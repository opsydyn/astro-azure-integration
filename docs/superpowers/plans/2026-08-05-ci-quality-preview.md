# CI Quality Gate and Pull-Request Preview Smoke Implementation Plan

> For agentic workers: REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Make CI, release, and Azure deployment consume one pinned quality gate and make pull-request smoke tests target the preview deployment for the commit under test.

**Architecture:** Add a local reusable workflow containing the complete local quality sequence. CI, release, and Azure deployment call it before their own work; downstream jobs rebuild artifacts. The Azure workflow resolves a successful current-commit deployment status environment_url for pull requests and fails closed when no preview URL exists. Production smoke remains limited to non-PR events.

**Tech Stack:** GitHub Actions reusable workflows, actions/github-script, Bun 1.3.11, Astro 7, Vitest, Ruby Psych, Azure Static Web Apps Deploy.

## Global Constraints

- Preserve the current Azure Static Web Apps Deploy action and pull_request close lifecycle.
- The reusable quality workflow runs bun install --frozen-lockfile with Bun 1.3.11.
- The quality sequence is bun run check, bun run lint, bun run lint:knip, API docs validation, bun run size, and package pack dry-run.
- CI, release, and Azure upload jobs consume the reusable workflow before their own work.
- Pull-request smoke uses a successful current-commit environment_url or fails; it never falls back to production.
- Pushes to main or master retain the production smoke target.
- Do not pin third-party actions to full commit SHAs or change npm authentication in this slice.
- Do not expand the smoke route matrix beyond /api/health.
- Do not add artifact transport; downstream jobs rebuild after the gate.
- Do not claim live Azure preview evidence from local tests.

---

## File Structure

- Create: .github/workflows/quality.yml — callable/manual quality gate.
- Modify: .github/workflows/ci.yml — call the reusable gate.
- Modify: .github/workflows/release.yml — require the gate and pin Bun.
- Modify: .github/workflows/azure-static-web-apps.yml — require quality and select PR preview smoke targets.
- Create: tests/workflows.test.ts — static workflow contract tests.
- Modify: HARDENING_ROADMAP.md — record local evidence and pending live evidence.

---

## Task 1: Add failing workflow contract tests

**Files:**
- Create: tests/workflows.test.ts

**Interfaces:**
- Consumes: the four workflow files as text.
- Produces: static assertions for workflow calls, Bun pins, dependencies, preview URL lookup, and fail-closed smoke selection.

- [ ] Step 1: Write the contract tests

Create tests/workflows.test.ts:

~~~ts
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const workflowDir = join(process.cwd(), ".github", "workflows");

async function readWorkflow(name: string): Promise<string> {
  return readFile(join(workflowDir, name), "utf8");
}

function namedStepBlock(source: string, name: string): string {
  const start = source.indexOf("- name: " + name);
  if (start < 0) return "";
  const nextStep = source.indexOf("\n      - name:", start + 1);
  return source.slice(start, nextStep < 0 ? source.length : nextStep);
}

describe("GitHub workflow hardening contract", () => {
  it("defines one pinned reusable quality gate", async () => {
    const quality = await readWorkflow("quality.yml");

    expect(quality).toContain("workflow_call:");
    expect(quality).toContain('bun-version: "1.3.11"');
    expect(quality).toContain("bun install --frozen-lockfile");
    expect(quality).toContain("bun run check");
    expect(quality).toContain("bun run lint");
    expect(quality).toContain("bun run lint:knip");
    expect(quality).toContain("docs:api:check");
    expect(quality).toContain("bun run size");
    expect(quality).toContain("pack:dry-run");
  });

  it("makes CI, release, and Azure upload depend on quality", async () => {
    const ci = await readWorkflow("ci.yml");
    const release = await readWorkflow("release.yml");
    const azure = await readWorkflow("azure-static-web-apps.yml");

    expect(ci).toMatch(/quality:\s*\n\s+uses: \.\/\.github\/workflows\/quality\.yml/s);
    expect(release).toMatch(/quality:\s*\n\s+uses: \.\/\.github\/workflows\/quality\.yml/s);
    expect(release).toMatch(/release:\s*\n\s+needs: quality/s);
    expect(azure).toMatch(/quality:\s*\n(?:\s+if:.*\n)?\s+uses: \.\/\.github\/workflows\/quality\.yml/s);
    expect(azure).toMatch(/build_and_deploy:\s*\n\s+needs: quality/s);
    expect(ci + "\n" + release + "\n" + azure).not.toContain("bun-version: latest");
  });

  it("keeps production out of PR smoke", async () => {
    const azure = await readWorkflow("azure-static-web-apps.yml");
    const smoke = namedStepBlock(azure, "Smoke test deployment");

    expect(azure).toContain("deployments: read");
    expect(azure).toContain("environment_url");
    expect(azure).toMatch(/github\.event_name\s*==\s*["']pull_request["']/);
    expect(azure).toContain("SMOKE_BASE_URL");
    expect(smoke).toContain("$SMOKE_BASE_URL/api/health");
    expect(smoke).not.toContain("blue-wave-00d0bf30f.7.azurestaticapps.net");
  });
});
~~~

- [ ] Step 2: Run the focused test and verify red

Run:

~~~bash
bun run test -- tests/workflows.test.ts
~~~

Expected: it fails because quality.yml is missing and the current Azure smoke
step contains the production hostname.

- [ ] Step 3: Commit the red contract

~~~bash
git add tests/workflows.test.ts
git commit -m "test(ci): define quality and preview smoke contracts"
~~~

---

## Task 2: Create the reusable quality gate and migrate CI/release

**Files:**
- Create: .github/workflows/quality.yml
- Modify: .github/workflows/ci.yml
- Modify: .github/workflows/release.yml

**Interfaces:**
- Consumes: repository scripts and packageManager bun@1.3.11.
- Produces: ./.github/workflows/quality.yml with a quality job that callers require with needs: quality.

- [ ] Step 1: Create quality.yml

~~~yaml
name: Quality Gate

on:
  workflow_call:
  workflow_dispatch:

permissions:
  contents: read

jobs:
  quality:
    name: Quality Gate
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4
      - name: Setup Bun
        uses: oven-sh/setup-bun@v2
        with:
          bun-version: "1.3.11"
      - name: Install dependencies
        run: bun install --frozen-lockfile
      - name: Run canonical check
        run: bun run check
      - name: Lint package
        run: bun run lint
      - name: Check Knip
        run: bun run lint:knip
      - name: Check API docs
        run: bun run --cwd packages/astro-azure-swa docs:api:check
      - name: Check size
        run: bun run size
      - name: Pack dry run
        env:
          npm_config_cache: ${{ runner.temp }}/npm-cache
        run: bun run --cwd packages/astro-azure-swa pack:dry-run
~~~

Do not add deployment secrets or Azure-specific permissions.

- [ ] Step 2: Replace ci.yml build job

Use this exact jobs block and retain the current workflow name, triggers,
concurrency, and workflow_dispatch:

~~~yaml
jobs:
  quality:
    name: Quality Gate
    uses: ./.github/workflows/quality.yml
    permissions:
      contents: read
~~~

- [ ] Step 3: Gate release.yml

Add this job before release:

~~~yaml
  quality:
    name: Quality Gate
    uses: ./.github/workflows/quality.yml
    permissions:
      contents: read
~~~

Add needs: quality to release and change its setup Bun input to:

~~~yaml
          bun-version: "1.3.11"
~~~

Keep Changesets, npm tokens, and GitHub release behavior unchanged.

- [ ] Step 4: Run focused tests

~~~bash
bun run test -- tests/workflows.test.ts
~~~

Expected: quality, CI, and release assertions pass; Azure preview assertions
remain red until Task 3.

- [ ] Step 5: Commit

~~~bash
git add .github/workflows/quality.yml .github/workflows/ci.yml .github/workflows/release.yml
git commit -m "ci: centralize reusable quality gate"
~~~

---

## Task 3: Make Azure PR smoke target the current preview

**Files:**
- Modify: .github/workflows/azure-static-web-apps.yml

**Interfaces:**
- Consumes: the Task 2 reusable workflow and GitHub deployment/status APIs.
- Produces: steps.smoke_target.outputs.base_url, selected from a successful current-commit preview on PRs or production on pushes.

- [ ] Step 1: Add permissions and quality dependency

Set permissions to:

~~~yaml
permissions:
  contents: read
  deployments: read
  pull-requests: write
~~~

Add before build_and_deploy:

~~~yaml
  quality:
    if: github.event_name != 'pull_request' || github.event.action != 'closed'
    name: Quality Gate
    uses: ./.github/workflows/quality.yml
    permissions:
      contents: read
~~~

Add needs: quality under build_and_deploy. Keep the existing close-event
condition so close events skip quality and upload.

- [ ] Step 2: Pin Bun and identify upload

Change the Azure setup input to:

~~~yaml
          bun-version: "1.3.11"
~~~

Add id: deploy to Deploy. Keep its action version, inputs, and artifact
verification commands unchanged.

- [ ] Step 3: Resolve the successful PR deployment URL

Add after Deploy:

~~~yaml
      - name: Resolve preview URL
        id: resolve_preview
        if: github.event_name == 'pull_request'
        uses: actions/github-script@v7
        with:
          script: |
            const deployments = await github.paginate(
              github.rest.repos.listDeployments,
              {
                owner: context.repo.owner,
                repo: context.repo.repo,
                sha: context.sha,
                per_page: 100,
              },
            );

            deployments.sort((left, right) => {
              return Date.parse(right.created_at) - Date.parse(left.created_at);
            });

            for (const deployment of deployments) {
              const statuses = await github.paginate(
                github.rest.repos.listDeploymentStatuses,
                {
                  owner: context.repo.owner,
                  repo: context.repo.repo,
                  deployment_id: deployment.id,
                  per_page: 100,
                },
              );
              const status = statuses.find(
                ({ state, environment_url }) =>
                  state === "success" && Boolean(environment_url),
              );

              if (status?.environment_url) {
                const url = status.environment_url.replace(/\/+$/, "");
                core.info("Using preview deployment " + deployment.id + " at " + url);
                core.setOutput("url", url);
                return;
              }
            }

            core.setFailed(
              "No successful preview deployment URL found for " + context.sha,
            );
~~~

The step must not read or infer the production hostname and must fail when
the current commit has no successful environment_url.

- [ ] Step 4: Select a smoke target with no PR fallback

Add after Resolve preview URL:

~~~yaml
      - name: Select smoke target
        id: smoke_target
        env:
          EVENT_NAME: ${{ github.event_name }}
          PREVIEW_URL: ${{ steps.resolve_preview.outputs.url }}
          PRODUCTION_URL: https://blue-wave-00d0bf30f.7.azurestaticapps.net
        run: |
          if [ "$EVENT_NAME" = "pull_request" ]; then
            case "$PREVIEW_URL" in
              https://*) ;;
              *)
                echo "No HTTPS preview URL was resolved for $GITHUB_SHA"
                exit 1
                ;;
            esac
            printf 'base_url=%s\n' "$PREVIEW_URL" >> "$GITHUB_OUTPUT"
          else
            printf 'base_url=%s\n' "$PRODUCTION_URL" >> "$GITHUB_OUTPUT"
          fi
~~~

- [ ] Step 5: Replace the production-only smoke step

~~~yaml
      - name: Smoke test deployment
        env:
          SMOKE_BASE_URL: ${{ steps.smoke_target.outputs.base_url }}
        run: |
          test -n "$SMOKE_BASE_URL"
          for attempt in $(seq 1 12); do
            status="$(curl -sS -o /tmp/swa-health.json -w "%{http_code}" "$SMOKE_BASE_URL/api/health" || true)"
            if [ "$status" = "200" ]; then
              echo "Smoke target: $SMOKE_BASE_URL"
              cat /tmp/swa-health.json
              exit 0
            fi
            echo "Attempt $attempt: $SMOKE_BASE_URL/api/health returned $status"
            sleep 10
          done
          echo "Deployment /api/health did not return 200 at $SMOKE_BASE_URL"
          cat /tmp/swa-health.json || true
          exit 1
~~~

- [ ] Step 6: Test and commit Azure changes

~~~bash
bun run test -- tests/workflows.test.ts
git diff --check
git add .github/workflows/azure-static-web-apps.yml
git commit -m "ci: smoke pull requests against preview deployments"
~~~

Expected: workflow contract tests pass; a live Azure preview is not expected
from the local run.

---

## Task 4: Verify locally and record roadmap evidence

**Files:**
- Modify: HARDENING_ROADMAP.md

**Interfaces:**
- Consumes: committed workflows and local quality scripts.
- Produces: local workflow evidence while leaving live CI and PR preview claims pending.

- [ ] Step 1: Parse all workflow YAML

~~~bash
ruby -e 'require "yaml"; ARGV.each { |path| YAML.safe_load_file(path, aliases: true); puts "parsed #{path}" }' .github/workflows/*.yml
~~~

Expected: all workflow files parse without syntax errors.

- [ ] Step 2: Run the complete local matrix

~~~bash
bun run check
env npm_config_cache=/private/tmp/astro-azure-npm-cache bun run lint
bun run lint:knip
bun run --cwd packages/astro-azure-swa docs:api:check
bun run size
env npm_config_cache=/private/tmp/astro-azure-npm-cache bun run --cwd packages/astro-azure-swa pack:dry-run
~~~

Expected: all commands exit 0. The new workflow contract test runs through the
root Vitest command inside bun run check.

- [ ] Step 3: Inspect invariants and status

~~~bash
rg -n "workflow_call|bun-version|needs: quality|environment_url|SMOKE_BASE_URL|blue-wave" .github/workflows
git diff --check
git status --short --branch
~~~

Expected: quality calls and Bun pins appear in intended workflows; the
production hostname appears only in non-PR target selection; the smoke step
uses SMOKE_BASE_URL; and generated output does not dirty tracked files.

- [ ] Step 4: Update roadmap honestly

- Mark the Phase 0 canonical quality command and Bun pin tasks [x] with the
  reusable workflow path and local verification date.
- Mark the Phase 2 reusable quality gate and PR preview URL tasks [~] rather
  than [x] until GitHub records a required quality run and PR preview smoke.
- Add workflow contract, YAML parse, and local matrix evidence.
- Keep the broader route matrix, action SHA pinning, npm trusted publishing,
  and live preview evidence unchecked.

- [ ] Step 5: Commit roadmap evidence

~~~bash
git diff --check
git add HARDENING_ROADMAP.md
git commit -m "docs: record CI preview gate evidence"
~~~

---

## Final verification

Run on the committed tree:

~~~bash
bun run test
git status --short --branch
git log --oneline -6
~~~

Expected: all tests pass, the worktree is clean, and the inline commits remain
on main. Do not claim live PR preview acceptance until a workflow run supplies
that evidence.

