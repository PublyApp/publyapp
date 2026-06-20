# Deterministic OpenAPI Output — Design Spec

- **Issue:** #683 — *chore(api): pin OpenAPI generated parameter ordering for a deterministic `openapi.json`*
- **Branch:** `codex/683-openapi-parameter-ordering`
- **Date:** 2026-06-20
- **Status:** Implementation largely complete and verified same-machine; remaining work is CI enforcement + SDK pinning.

## Problem

The build-time–generated `apps/api/openapi.json` is not deterministic across environments:
for minimal-API endpoints that combine a route path parameter with an `[AsParameters]` query
DTO, ASP.NET ApiExplorer's relative ordering of path-vs-query parameters can vary across
SDK/tooling versions. The document is committed and drives Kiota TypeScript client generation,
so reorder-only changes produce dirty working trees after every build, noisy PRs, spurious
conflicts, and potential `packages/client-ts` churn.

## Scope decision

**Chosen: finalize the existing fix + add a CI drift guard. Do NOT add speculative ordering for
`paths`/`tags`/`components.schemas`.**

This is evidence-backed (see Verification): a clean rebuild is already byte-identical with only
parameter + newline normalization, so there is zero observed drift in those other regions.
Adding sort logic for them would be YAGNI. If the CI guard ever flags drift elsewhere, that
failure tells us precisely what to extend — turning guesswork into evidence.

## Already implemented (on the branch, verified)

Commit `bc263d6f1` (single commit on top of `develop`):

- **`apps/api/Lib/OpenApiDocumentNormalizer.cs`** — an `IOpenApiDocumentTransformer` that:
  - sorts each operation's (and path-item's) parameters by a stable key:
    location (`path` → `query` → `header` → `cookie`), then route-template index for path params,
    then ordinal name, then original index;
  - normalizes description newlines (`\r\n`/`\r` → `\n`) across info, paths, operations,
    parameters, and recursively through component schemas.
- **`apps/api/Lib/ServiceRegistration.cs`** — registers it via
  `options.AddDocumentTransformer<OpenApiDocumentNormalizer>()` next to the existing schema transformer.
- **`apps/api/Lib/Architecture/OpenApiContract.Spec.cs`** — 4 static guard tests (read the committed
  spec): canonical parameter order, no escaped `\r\n` in descriptions, snake_case query names,
  audit-log export response metadata.
- **`apps/api/Lib/Testing/Helpers/OpenApiDocumentHelper.cs`** — adds `ReadTextAsync()`.
- Regenerated `apps/api/openapi.json` + `packages/client-ts/src/kiota-lock.json`.
- Docs note in `docs/guides/openapi-kiota-safeguards.md` → "Deterministic OpenAPI Output".

## Verification performed (2026-06-20, this machine)

| AC | Criterion | Result |
|----|-----------|--------|
| 2 | `git status` clean after `just build-api` | PASS — clean after build (build ~5–17s) |
| — | Negative control: transformer is the cause | PASS — 62 lines drift with it disabled; clean when restored |
| 3 | `generate-client` stable, no client churn | PASS (content) — only a transient Windows-local CRLF on `models/index.ts` that `.gitattributes (eol=lf)` normalizes to byte-identical |
| 4 | Regression test enforces it | PASS — 4/4 `OpenApiContractSpec` green (179 ms, no Docker) |
| 1 | Byte-identical across machines/CI | Same-machine proven; cross-machine requires CI |
| 4 | Durable CI check | MISSING — only the static spec exists today |

**Reproducible verification recipe** (kept as living acceptance evidence):

```bash
git switch codex/683-openapi-parameter-ordering
git status --short                      # baseline empty
just build-api && git status --short    # PASS = empty
# negative control:
#   comment out AddDocumentTransformer<OpenApiDocumentNormalizer>()
just build-api && git status --short    # EXPECT openapi.json drifts
#   restore the line
just build-api && git status --short    # clean again
just generate-client && git status --short   # no real content churn
cd apps/api && dotnet test Tests/PublyApp.Api.Tests.csproj -c Test \
  --filter "FullyQualifiedName~OpenApiContractSpec"
```

## Remaining work

### Piece 1 — CI drift guard (core deliverable)

New workflow `.github/workflows/openapi-spec-drift.yml`, matching the minimal style of the existing
`require-linked-issue.yml`:

- `on: pull_request` + `push` to `develop`, paths-filtered to `apps/api/**`,
  `packages/client-ts/**`, `justfile`, and the workflow file itself.
- `runs-on: ubuntu-latest`; least-privilege `permissions: { contents: read }`.
- Setup steps: `.NET` SDK (pinned — see Piece 2), `just`, `node` + `pnpm`, `kiota`.
- Steps:
  1. `just build-api` → `git diff --exit-code apps/api/openapi.json` (fail if dirty).
  2. `just generate-client` → `git diff --exit-code packages/client-ts` (fail if dirty).
     On Linux CI, generated `.ts` is emitted with LF, so no CRLF noise.
  3. `dotnet test … --filter FullyQualifiedName~OpenApiContractSpec` as a fast static gate.

Closes AC #1 (cross-machine) and AC #4 (CI enforcement).

### Piece 2 — pinned SDK (prerequisite of Piece 1)

Add a repo-root `global.json` with `version: 10.0.102`, `rollForward: latestFeature`. This is issue
approach #2, justified here because the drift guard must build with a known SDK to be reliably green.
`latestFeature` keeps local devs on newer SDKs unblocked, while CI pins the exact version in
`setup-dotnet` to install `10.0.102` — the band that produced the committed spec (confirmed via
`dotnet --version` on the build machine; the issue text's `10.0.300` was a different environment).
If a future SDK feature band changes the generated output, the guard fails loudly and we regenerate +
re-pin deliberately (rather than drifting silently).

### Piece 3 — optional CRLF tidy

Extend the `generate-client` post-step in the `justfile` (which already normalizes
`kiota-lock.json` CRLF → LF) to also normalize generated `.ts` files, removing the cosmetic
Windows working-tree noise on `models/index.ts`. Skippable; CI is unaffected (Linux emits LF).

### Piece 4 — PR

Open a PR from `codex/683-openapi-parameter-ordering` with `Closes #683` in the body (satisfies the
linked-issue gate). Do not merge — user merges.

## Non-goals

- Stable ordering of `paths`, `tags`, or `components.schemas` — evidence shows no drift there.
- Any change to the existing schema transformer or to request/response schemas, routes, or behavior.
  Parameter ordering is cosmetic to the contract.

## Acceptance criteria (for sign-off)

1. CI workflow exists and, on a clean PR build, leaves `apps/api/openapi.json` and
   `packages/client-ts` byte-clean (`git diff --exit-code` passes).
2. `global.json` pins the SDK; local `just build-api` still works for devs on the pinned band.
3. `OpenApiContractSpec` runs in CI and passes.
4. PR links #683 and the existing require-linked-issue gate is green.
