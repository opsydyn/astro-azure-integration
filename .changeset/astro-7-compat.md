---
"@opsydyn/astro-azure-swa": major
---

Require Astro 7. Drops support for Astro 6.

The adapter's request path (`createApp()` → `astro/app/entrypoint` → `App.render()`) is unchanged and requires no code changes for Astro 7 — this release only raises the `astro` peer dependency floor to `^7.0.0` and re-verifies the full test suite, build, and example app against it. Astro 7's new Advanced Routing (`src/fetch.ts`) and `astro/fetch` API are fully usable with this adapter with no special integration required.
