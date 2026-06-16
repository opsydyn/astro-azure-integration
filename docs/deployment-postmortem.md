# Deployment Post-Mortem: Astro Azure SWA Adapter

**Date:** 2026-06-16
**Scope:** First end-to-end deployment of `@opsydyn/astro-azure-swa` to Azure Static Web Apps via Terraform and GitHub Actions.

---

## Summary

Getting the custom Astro SSR adapter running on Azure Static Web Apps required resolving seven distinct issues across three areas: Terraform state management, the SWA GitHub Actions deploy action, and the adapter's generated output. None of the individual issues were blockers in isolation — they were surfaced in sequence as each layer was fixed.

The deployment is now live at:

https://blue-wave-00d0bf30f.7.azurestaticapps.net/

The main product lesson is that Azure Functions should remain a generated deployment detail. User-land development should stay close to standard Astro: `astro dev`, `astro build`, and `astro preview` should work without requiring developers to start Azure Functions Core Tools or the SWA CLI.

---

## Issues

### 1. Terraform Remote State — Wrong Resource Group Name

**What happened:** The bootstrap script created a new `tfstate-rg` resource group for Terraform state. The subscription already had `rg-terraform-state` containing state storage accounts for other projects.

**Fix:** Updated `bootstrap.sh` to use the pre-existing `rg-terraform-state` group and matched the `uksouth` region of the existing accounts.

**Lesson:** Check for existing state infrastructure before bootstrapping. A `az group list` scan up front would have caught this.

---

### 2. Storage Blob Data Contributor Missing for Local User

**What happened:** `terraform init -migrate-state` failed with `403 AuthorizationPermissionMismatch`. The bootstrap script granted `Storage Blob Data Contributor` on the state storage account to the service principal — but not to the developer's own Azure CLI identity. Terraform's `use_azuread_auth = true` backend requires the caller to have blob access.

**Fix:** Ran `az role assignment create` to grant the role to the signed-in user's object ID.

**Lesson:** The bootstrap script should grant `Storage Blob Data Contributor` to both the service principal (for CI) and the current signed-in user (for local Terraform runs) in one step.

---

### 3. Empty Remote State After First Apply

**What happened:** The first `terraform apply` succeeded (51s) and created both Azure resources, but wrote state to a local `.tfstate` file. When we later added the `backend "azurerm"` block and ran `terraform init -migrate-state`, the local state was already gone — so the migration copied an empty state to the remote backend. The remote backend ended up with no resources tracked.

**Fix:** Ran `terraform import` for both `azurerm_resource_group.main` and `azurerm_static_web_app.main` to bring the already-created resources into the remote state.

**Lesson:** Add the backend block before running any `terraform apply`. The correct order is: backend exists → `terraform init` → `terraform apply`. Running apply with a local backend and then migrating is fragile.

---

### 4. Wrong Deployment Token from `terraform output`

**What happened:** After importing the resources, `terraform output -raw deployment_token` returned an incorrect value. `terraform import` does not populate sensitive resource attributes — they are only populated after a real `terraform apply` or `terraform refresh`. The imported state had the resource IDs but not the `api_key`. The incorrect token was set as `AZURE_STATIC_WEB_APPS_API_TOKEN` in GitHub secrets.

**Fix:** Fetched the real token directly from Azure: `az staticwebapp secrets list` and updated the GitHub secret via `gh secret set`.

**Lesson:** After importing resources, always run `terraform apply` (or at minimum `terraform refresh`) before reading sensitive outputs. `terraform import` is not a substitute for a full apply.

---

### 5. SWA Deploy Action — Wrong `app_location` / `output_location` Pattern

**What happened:** The initial "unknown exception" from the `Azure/static-web-apps-deploy@v1` action was misdiagnosed as a config issue. We changed the workflow to `app_location: /` + `output_location: examples/basic/dist/client`, reasoning this was the standard pre-built pattern. This caused a new error: "Failed to find a default file in the app artifacts folder (/)". With `skip_app_build: true`, the deploy action uses `app_location` directly as the artifacts folder and ignores `output_location` entirely.

**Fix:** Reverted to `app_location: examples/basic/dist/client` with no `output_location`. The original config was correct.

**Lesson:** The "unknown exception" from the SWA deploy action is an extremely generic error — do not change workflow config in response to it without first verifying the token is correct. Fix the most likely root cause (auth) before touching structural config.

---

### 6. `staticwebapp.config.json` Written to Wrong Directory

**What happened:** The adapter's generator wrote `staticwebapp.config.json` to `dist/` (the root of the Astro output). The SWA deploy action looks for it inside the artifacts folder — `dist/client/`. The config file was never picked up by the deploy action.

**Fix:** Updated `generate.ts` to write the config to `dist/client/staticwebapp.config.json` alongside the static assets.

**Lesson:** The SWA deploy action treats the artifacts folder as a self-contained unit. Any SWA-specific config files must live inside it, not alongside it.

---

### 7. SWA Deploy Action Requires `index.html`

**What happened:** Even after fixing the config file location, the deploy action failed with "Failed to find a default file in the app artifacts folder". The SWA deploy action hard-requires an `index.html` (or `Index.html`) in the artifacts folder before it will proceed, regardless of whether the app is SSR-only.

**Fix:** Updated `generate.ts` to write an empty `index.html` placeholder to `dist/client/` if one does not already exist. Because `staticwebapp.config.json` contains a `/* → /api/server` rewrite rule, this file is never actually served.

**Lesson:** Azure SWA's deploy tooling assumes some static content always exists. For fully server-rendered apps, a placeholder must satisfy this check even if routing rules ensure it is never served.

---

### 8. `host.json` `routePrefix: ""` Rejected by SWA

**What happened:** The generated `host.json` set `extensions.http.routePrefix` to `""` (empty string). This is the correct setting for standalone Azure Functions where you want function routes without the `/api` prefix. Azure Static Web Apps managed functions require `routePrefix: "api"` — any other value is explicitly rejected with: *"the host.json file cannot specify a http.routePrefix value other than 'api'"*.

**Fix:** Changed `routePrefix` to `"api"` in the generated `host.json`.

**Lesson:** SWA managed functions are not identical to standalone Azure Functions. Settings that are valid in standalone mode (particularly routing config) may be invalid or mean something different in the managed context. The SWA gateway handles the outer `/api` prefix; the functions runtime should use `"api"` so its internal routes align with what SWA proxies.

---

## Sequence Diagram

```
terraform apply (local state) → resources created
     ↓
backend block added + terraform init -migrate-state → empty state migrated
     ↓
terraform apply fails: resources already exist
     ↓
terraform import × 2 → resources in remote state (sensitive attrs missing)
     ↓
terraform output → wrong token set in GitHub secret
     ↓
CI deploy → "unknown exception" (wrong token)
     ↓ (misdiagnosed as config issue)
app_location: / → "no index.html at /"
     ↓ (reverted)
correct token set via az CLI → "unknown exception" gone
     ↓
staticwebapp.config.json in wrong dir → config not applied
     ↓
no index.html → deploy action refuses to proceed
     ↓
routePrefix: "" → SWA rejects host.json
     ↓ ✅
```

---

## Mitigations for Next Time

| Risk | Mitigation |
|---|---|
| Backend added after first apply | Always add backend block before the first `terraform apply` |
| `terraform import` missing sensitive attrs | Run `terraform apply` after import to populate outputs |
| Generic SWA "unknown exception" | Verify token via `az staticwebapp secrets list` before changing anything else |
| SWA managed functions vs standalone differences | Test locally with `swa start` before pushing to CI |
| Bootstrap not granting local user access | Add current-user role assignment to bootstrap script |

## DX Follow-Up

- Keep `astro dev` on Astro's normal dev server.
- Use the adapter's `previewEntrypoint` for `astro preview` so built output can be tested without Azure Functions Core Tools.
- Keep SWA CLI validation as an explicit platform-fidelity step, not the default local workflow.
- Make generated Azure files self-contained during `astro build` so deployments do not depend on npm-publishing the adapter package.
