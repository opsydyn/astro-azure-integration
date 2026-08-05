# Hardening Roadmap Design

**Date:** 2026-08-05
**Status:** Approved in conversation
**Artifact:** [`HARDENING_ROADMAP.md`](../../../HARDENING_ROADMAP.md)

## Intent

Create a standalone, checkable roadmap for progressing `@opsydyn/astro-azure-swa` from a working production proof to a reproducible, releaseable, and operationally safer adapter. The existing `ROADMAP.md` remains the historical/product-direction record and is not replaced.

## Chosen structure

Use a phase-gated roadmap rather than a flat workstream list or a release-only plan. The phases follow dependency order:

1. baseline and reproducibility;
2. adapter and generated-runtime correctness;
3. CI/CD and release gates;
4. Azure and infrastructure hardening;
5. package and documentation readiness;
6. optional enhancements after hardening.

The roadmap carries workstream labels so readers can filter by adapter, CI, Azure, infrastructure, security, documentation, or enhancement without losing the dependency order.

## Completion model

Every task contains a priority, dependency, observable acceptance condition, evidence field, and verification date. Existing assessment results are recorded as a dated baseline only; they do not automatically mark a new task complete.

The roadmap has five release gates:

- Gate A: clean local quality;
- Gate B: packed package and isolated consumer;
- Gate C: Azure PR preview;
- Gate D: production deployment;
- Gate E: hardened publication.

No release or production task may advance while its gate is red or while a P0 item is unowned.

## Scope decisions

- Preserve the native Astro + Azure Functions v4 architecture.
- Keep streaming as a measured feasibility spike, not an assumed feature.
- Treat generated dependency closure, runtime version selection, and CI/deployment sequencing as hardening work before showcase enhancements.
- Use dated evidence for live Azure, npm, and security claims because those states can drift.
- Record unresolved Node 20/22 and dependency-closure choices in a decision log rather than hiding them in unchecked prose.

## Review criteria

Before implementation begins, review the roadmap for:

- no placeholder or ambiguous acceptance language;
- no phase-order contradiction;
- no unchecked P0 task without a clear owner path;
- no claim that upload equals runtime verification;
- no optional enhancement that silently blocks the hardened release;
- links and paths resolving from the repository root.
