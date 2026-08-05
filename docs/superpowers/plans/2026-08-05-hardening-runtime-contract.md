# Adapter Runtime Contract Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the first hardening slice reproducible from a clean checkout and ensure the generated Azure Functions runtime matches the consuming Astro 7 project and the supported Azure Node runtimes.

**Architecture:** Keep the native Astro integration and Azure Functions v4 bridge unchanged at the request boundary. Move runtime manifest creation behind a fail-closed resolver that reads the consuming project manifest, validates Astro 7, and emits deployable runtime dependencies. The package will retain both `node:20` and `node:22` configuration options, compile to the lower supported Node target, and verify the contract through generated-file tests and the example build.

**Tech Stack:** Bun 1.3.11, Astro 7, TypeScript, tsdown, Vitest, Azure Functions v4, Azure Static Web Apps.

## Global Constraints

- Preserve the native Astro + Azure Functions v4 architecture; do not add Nitro, H3, or another server runtime.
- The adapter peer dependency remains Astro `^7.0.0`.
- Generated `api/package.json` must never fall back to Astro 6.
- Missing, malformed, or incompatible consumer manifests must fail the build with an actionable error.
- Keep both `node:20` and `node:22` as supported `AzureSwaApiRuntime` values in this slice.
- Align the package engine and emitted code with the lower supported Node runtime; later CI work must execute the matrix on both Node versions.
- Use existing Vitest tests and the existing temporary-directory fixture style.
- Do not implement CI action pinning, Azure OIDC, Terraform changes, package licence/docs cleanup, streaming, or showcase enhancements in this plan; those are separate roadmap plans.

---

## File Structure

- Modify: `package.json` — pin Bun and make the root hardening check build before typechecking the workspace consumer.
- Modify: `packages/astro-azure-swa/package.json` — align the published Node engine with the retained Node 20/22 contract.
- Modify: `packages/astro-azure-swa/tsdown.config.ts` — emit code compatible with Node 20 and Node 22.
- Modify: `packages/astro-azure-swa/src/generate.ts` — resolve and validate consumer runtime dependencies; remove the Astro 6 fallback and silent catch-all failure.
- Modify: `packages/astro-azure-swa/src/index.ts` — require a known project root before generation and pass it to the resolver.
- Modify: `packages/astro-azure-swa/test/generate.test.ts` — cover Astro 7 resolution, devDependency fallback, invalid manifests, and generated output.
- Create: `packages/astro-azure-swa/test/package-contract.test.ts` — lock the public peer/engine/runtime contract.
- Modify: `tests/basic-build.test.ts` — assert the real example emits its Astro 7 runtime dependency.

## Task 1: Make the root hardening check clean-checkout safe

**Files:**
- Modify: `package.json:1-36`

**Interfaces:**
- Produces: a root `check` command that builds the workspace adapter before the example typecheck runs.
- Produces: a root `packageManager` declaration of `bun@1.3.11` for local and CI toolchain alignment.

- [ ] **Step 1: Reproduce the current clean-checkout failure**

Run in a disposable checkout so no working files are removed from the active workspace:

```bash
CHECKOUT_DIR="$(mktemp -d)"
git archive HEAD | tar -x -C "$CHECKOUT_DIR"
(cd "$CHECKOUT_DIR" && bun install --frozen-lockfile && bun run check)
```

Expected: the current command fails during example typechecking because the workspace adapter has not been built and its package exports point at missing `dist` files. Preserve the error in the task notes.

- [ ] **Step 2: Write the minimal script fix**

In `package.json`, add:

```json
"packageManager": "bun@1.3.11"
```

Change the root check order from:

```json
"check": "bun run typecheck && bun run build && bun run test && bun run test:example"
```

to:

```json
"check": "bun run build && bun run typecheck && bun run test && bun run test:example"
```

Do not change the existing individual script names in this task.

- [ ] **Step 3: Verify the clean-checkout fix**

Run the same disposable-checkout command from Step 1.

Expected: `bun run check` exits 0, the adapter builds before `astro check`, Vitest passes, and the example build completes.

- [ ] **Step 4: Verify the active workspace and commit**

Run:

```bash
git diff --check
git status --short --branch
git add package.json
git commit -m "chore: make hardening check reproducible"
```

Expected: no whitespace errors and only the intended root manifest change is committed.

## Task 2: Add failing tests for the Astro 7 runtime manifest

**Files:**
- Modify: `packages/astro-azure-swa/test/generate.test.ts:1-287`
- Modify: `tests/basic-build.test.ts:29-65`

**Interfaces:**
- Consumes: `generateAzureSwaFiles({ distDir, functionName, projectRoot })`.
- Produces: tests that specify the resolver contract before implementation changes.

- [ ] **Step 1: Add a temporary project manifest fixture**

Extend the existing `beforeEach` in `generate.test.ts` to write `root/package.json` containing:

```json
{
  "name": "fixture-app",
  "dependencies": {
    "astro": "7.0.0",
    "react": "19.2.7"
  }
}
```

Add:

```ts
function projectRootUrl(): URL {
  return pathToFileURL(`${root}/`);
}
```

Pass `projectRoot: projectRootUrl()` to every generator call in the test file. This makes the test use the same required input as the real Astro build hook.

- [ ] **Step 2: Change the existing generated-manifest expectation**

Update the first generator test to expect:

```ts
dependencies: {
  "@azure/functions": "^4.0.0",
  astro: "7.0.0",
  react: "19.2.7"
}
```

The current implementation should fail this assertion because it emits `^6.0.0` and does not receive a project root.

- [ ] **Step 3: Add resolver failure and fallback tests**

Add tests with isolated temporary manifests for these exact cases:

```ts
it("uses Astro from devDependencies when it is not a runtime dependency", async () => {
  await writeProjectPackage({
    devDependencies: { astro: "7.1.6" },
  });

  await generateAzureSwaFiles({
    distDir: distUrl(),
    functionName: "server",
    projectRoot: projectRootUrl(),
  });

  await expect(readJson("api/package.json")).resolves.toMatchObject({
    dependencies: { astro: "7.1.6" },
  });
});

it("rejects a missing Astro dependency", async () => {
  await writeProjectPackage({ dependencies: { react: "19.2.7" } });

  await expect(
    generateAzureSwaFiles({
      distDir: distUrl(),
      functionName: "server",
      projectRoot: projectRootUrl(),
    }),
  ).rejects.toThrow(/Astro 7 dependency/i);
});

it("rejects an Astro 6 dependency", async () => {
  await writeProjectPackage({ dependencies: { astro: "6.0.0" } });

  await expect(
    generateAzureSwaFiles({
      distDir: distUrl(),
      functionName: "server",
      projectRoot: projectRootUrl(),
    }),
  ).rejects.toThrow(/Astro 7/i);
});

it("reports malformed project manifests", async () => {
  await writeFile(join(root, "package.json"), "{\n", "utf8");

  await expect(
    generateAzureSwaFiles({
      distDir: distUrl(),
      functionName: "server",
      projectRoot: projectRootUrl(),
    }),
  ).rejects.toThrow(/package.json/i);
});
```

`writeProjectPackage` should replace the fixture file with a JSON object and retain the `name: "fixture-app"` field.

- [ ] **Step 4: Add the end-to-end generated manifest assertion**

After the example build in `tests/basic-build.test.ts`, read `dist/api/package.json` and assert:

```ts
expect(generatedPackage.dependencies.astro).toBe("7.0.0");
```

- [ ] **Step 5: Run the focused tests and verify red**

Run:

```bash
bun run test -- packages/astro-azure-swa/test/generate.test.ts tests/basic-build.test.ts
```

Expected: the new Astro 7 assertions fail against the `^6.0.0` fallback and/or the missing project-root handling. Do not modify implementation code before this red result is observed.

## Task 3: Implement fail-closed Astro 7 dependency resolution

**Files:**
- Modify: `packages/astro-azure-swa/src/generate.ts:5-84,184-201`
- Modify: `packages/astro-azure-swa/src/index.ts:20-56`
- Test: `packages/astro-azure-swa/test/generate.test.ts`

**Interfaces:**
- Consumes: a required `projectRoot: URL` from the adapter build hook.
- Produces: generated `api/package.json` with the consumer’s Astro 7 declaration and non-workspace application dependencies.

- [ ] **Step 1: Make the generator input explicit**

Change `GenerateAzureSwaFilesOptions.projectRoot` from optional to required. In `src/index.ts`, keep the local variable optional during config discovery, but in `astro:build:done` throw:

```ts
if (!projectRoot) {
  throw new Error(
    `${ADAPTER_NAME} could not determine the Astro project root before build completion`,
  );
}
```

Pass the narrowed `projectRoot` to `generateAzureSwaFiles`.

- [ ] **Step 2: Replace the silent dependency reader with a resolver**

Replace `readProjectDependencies` with a function of this shape:

```ts
interface ProjectPackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
}

async function resolveProjectRuntimeDependencies(
  projectRoot: URL,
): Promise<Record<string, string>>
```

Implementation rules, in order:

1. Read `<projectRoot>/package.json`; include the path in every thrown error.
2. Parse JSON and throw an error that identifies malformed JSON instead of returning `{}`.
3. Merge `optionalDependencies` first, then `dependencies`, so normal runtime dependencies win.
4. Resolve `astro` from merged runtime dependencies, then `devDependencies` if no runtime declaration exists.
5. Extract the first numeric major from the Astro declaration; reject declarations that cannot identify a major.
6. Reject any major other than `7` with an error naming the detected declaration and supported range.
7. Add a devDependency Astro declaration to the emitted runtime dependencies when it was the selected source.
8. Filter `workspace:` entries from copied non-Astro dependencies, preserving the existing workspace safety behaviour.
9. Return the resolved dependency map without adding the adapter package itself or a hard-coded Astro fallback.

Use the returned map at `generate.ts:72-83` and retain `@azure/functions: "^4.0.0"` as the adapter-owned runtime dependency.

- [ ] **Step 3: Run the focused tests and verify green**

Run:

```bash
bun run test -- packages/astro-azure-swa/test/generate.test.ts tests/basic-build.test.ts
```

Expected: all generator and example-build assertions pass, including Astro 7 output and failure-path errors.

- [ ] **Step 4: Commit the runtime resolver**

Run:

```bash
git diff --check
git add packages/astro-azure-swa/src/generate.ts packages/astro-azure-swa/src/index.ts packages/astro-azure-swa/test/generate.test.ts tests/basic-build.test.ts
git commit -m "fix(adapter): resolve Astro 7 runtime dependencies"
```

## Task 4: Align the published Node contract with Node 20/22 support

**Files:**
- Modify: `packages/astro-azure-swa/package.json:27-29,83-100`
- Modify: `packages/astro-azure-swa/tsdown.config.ts:10-18`
- Create: `packages/astro-azure-swa/test/package-contract.test.ts`

**Interfaces:**
- Consumes: `AzureSwaApiRuntime = "node:20" | "node:22"` and generated `platform.apiRuntime`.
- Produces: a package that advertises Node `>=20.0.0` and emits syntax compatible with both selected Azure runtimes.

- [ ] **Step 1: Write the contract test**

Create `package-contract.test.ts`:

```ts
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const packagePath = fileURLToPath(new URL("../package.json", import.meta.url));

describe("published runtime contract", () => {
  it("advertises the supported Astro and Node ranges", async () => {
    const packageJson = JSON.parse(await readFile(packagePath, "utf8")) as {
      engines?: { node?: string };
      peerDependencies?: { astro?: string };
    };

    expect(packageJson.engines?.node).toBe(">=20.0.0");
    expect(packageJson.peerDependencies?.astro).toBe("^7.0.0");
  });
});
```

- [ ] **Step 2: Run the contract test and verify red**

Run:

```bash
bun run test -- packages/astro-azure-swa/test/package-contract.test.ts
```

Expected: it fails because the package currently advertises Node `>=22.0.0`.

- [ ] **Step 3: Make the minimal contract changes**

Change `packages/astro-azure-swa/package.json` to:

```json
"engines": {
  "node": ">=20.0.0"
}
```

Change `packages/astro-azure-swa/tsdown.config.ts` to:

```ts
target: "node20",
```

Do not remove either `node:20` or `node:22` from the public adapter options or generated config type.

- [ ] **Step 4: Run package contract and build verification**

Run:

```bash
bun run test -- packages/astro-azure-swa/test/package-contract.test.ts packages/astro-azure-swa/test/generate.test.ts
bun run --cwd packages/astro-azure-swa typecheck
bun run build
```

Expected: contract tests, typecheck, and tsdown build all pass; generated output contains no Node 22-only adapter syntax by intentional target.

- [ ] **Step 5: Commit the Node contract**

Run:

```bash
git diff --check
git add packages/astro-azure-swa/package.json packages/astro-azure-swa/tsdown.config.ts packages/astro-azure-swa/test/package-contract.test.ts
git commit -m "fix(adapter): align Node 20 and 22 runtime contract"
```

## Task 5: Run the complete first-slice verification

**Files:**
- No source changes expected.

- [ ] **Step 1: Run the clean-checkout check again**

Use a disposable checkout as in Task 1, then run:

```bash
bun install --frozen-lockfile
env npm_config_cache=/private/tmp/astro-azure-npm-cache bun run check
```

Expected: exit 0 with adapter build preceding example typecheck.

- [ ] **Step 2: Run focused and package-quality checks**

Run:

```bash
bun run test
env npm_config_cache=/private/tmp/astro-azure-npm-cache bun run lint
bun run lint:knip
bun run --cwd packages/astro-azure-swa docs:api:check
bun run size
env npm_config_cache=/private/tmp/astro-azure-npm-cache bun run --cwd packages/astro-azure-swa pack:dry-run
```

Expected: all commands exit 0; the package tarball still contains only intended files and the size-limit remains below 15 kB.

- [ ] **Step 3: Inspect generated artifacts**

Run:

```bash
node -e 'const p=require("./examples/basic/dist/api/package.json"); if(p.dependencies.astro !== "7.0.0") process.exit(1); console.log(p.dependencies.astro)'
test -f examples/basic/dist/client/staticwebapp.config.json
test -f examples/basic/dist/api/server/index.mjs
git diff --check
git status --short --branch
```

Expected: the generated Astro version is `7.0.0`, required SWA files exist, and the worktree contains no unintended source changes.

- [ ] **Step 4: Record evidence and close the slice**

Update the corresponding checkboxes and evidence fields in `HARDENING_ROADMAP.md` for the completed Phase 0 and Phase 1 tasks. Record the Node 20/22 decision in decision log entry `D-001`, including the CI matrix work that remains in the separate CI/CD plan.

## Follow-up plans

After this plan is reviewed and executed, create separate implementation plans for:

1. CI/CD preview smoke tests, reusable quality gates, action pinning, and npm trusted publishing.
2. Azure OIDC, Terraform least privilege, protected environments, and recovery runbooks.
3. Package licence/docs/version matrix and isolated published-consumer release checks.
4. Streaming feasibility, observability, Elysia statistics, CRUD persistence, and performance baselines.

Each follow-up plan should start from the gates completed here and remain independently testable.
