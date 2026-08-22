# Spec — `scripts/` → `packages/scripts-ts` (TypeScript only)

- **Part of:** #1181
- **Status:** Owner review (spec + plan lane; no code moves in this PR)
- **Author:** jcode (model: hy3, reasoning_effort high)
- **Date:** 2026-08-22

## 1. Goal

Move the 31 `.mjs` files (plus `ci-gate-manifest.json` and `tsconfig.lint.json`) out of the
root `scripts/` folder and into a first-class pnpm workspace package `packages/scripts-ts`,
written **exclusively in TypeScript**, typechecked under the repo's strict base, linted by the
repo-wide quality gate, and tested with the same runner as the other packages. The scripts must
keep running with **bare `node`** (Node 24 native type stripping) — no `tsx`, no compile step.

## 2. Why it is like this today

The root `scripts/` folder predates the workspace packages (first scripts landed with #870 on
2026-07-17). `.mjs` was chosen so CI could run them with bare `node` without a build step. The
folder is now outside the pnpm workspace (`pnpm-workspace.yaml` lists `apps/*` and `packages/*`),
so it receives no workspace tooling, no `tsc` gate, and no uniform test runner — it is plain
JavaScript guarded only by the per-file `node --test` invocations the justfile wires up.

## 3. Constraints (from issue #1181)

- **Run without a build step.** `.nvmrc` is `24.x`, `.node-version` is `v24.x`, CI uses
  `node-version: 24` in every workflow, and the deploy Dockerfiles use `node:24-alpine`. Node 24
  strips TypeScript types natively (`node file.ts`), so `.ts` scripts keep running with bare
  `node`. No `tsx`, no `tsc` emit, no bundle.
- **Every reference updates in the same PR as its move.** 108 references were cited in the brief;
  the verified count is **129 active root-resolving references** (see §5). `scripts/ci-gate-manifest.json`
  + `check-ci-drift` and `check-ci-gate-structure` must keep passing (they assert the workflows).
- **Ladder, not big bang.** PR0 creates the package, moves the files as-is (renamed `.ts`, typed
  minimally but enough to pass `tsc --noEmit` under strict base), updates every reference, and
  deletes root `scripts/`. Following PRs convert groups of scripts to strict, idiomatic TypeScript
  with their tests and remove any `@ts-expect-error`/loose typing introduced in PR0.
- **Docs.** `AGENTS.md` "Monorepo Structure" and the `docs/guides/*` that cite `scripts/` paths.

## 4. Global Constraints (copied verbatim; every task inherits these)

- Node floor: **24.x** (`.nvmrc`), `.node-version` **v24.x**, CI `node-version: 24`, Dockerfiles
  `node:24-alpine`. No script may run under a different Node.
- **Erasable syntax only** in `packages/scripts-ts`: no `enum`, no `namespace`, no parameter
  properties (`constructor(private x)`), no `experimentalDecorator`-dependent patterns that require
  emit. Node 24 type stripping drops only types; any of these require a build step and would break
  `node file.ts`. Confirmed: the current `.mjs` files use none of these (the only `namespace`
  token is inside a test *fixture string literal* in `check-migration-expand-contract.test.mjs`,
  not real syntax).
- `tsc --noEmit` must pass under `packages/_tsconfig/tsconfig.base.json` (`strict: true`,
  `noUnusedLocals: true`, `noUnusedParameters: true`, `noImplicitAny` on via `strict`).
- The repo lint gate sets **`typescript/no-explicit-any: error`** (`.oxlintrc.json`), so the `any`
  keyword is forbidden. Rung 0 types without `any` (use `unknown`, `Record<string, unknown>`,
  explicit param types). `@ts-expect-error` is permitted only where a genuine edge resists typing
  in rung 0 and must be removed in a later rung.
- Package name: **`@org/scripts-ts`** (matches repo scope `@org/*`).
- Test runner: **`node --test`** (follow `packages/lint-ts`), not vitest.
- `pnpm lint` (`oxlint --quiet .`, repo-wide) already covers `packages/*`; the new package is
  linted with no extra config. `oxfmt` format globs in root `package.json` must gain
  `packages/scripts-ts/**/*.{ts}`.
- `pnpm lint` must stay green. `check-ci-drift` + `check-ci-gate-structure` + `codeowners-contract`
  must stay green after the move (they assert script paths).

## 5. Inventory

### 5.1 Reference count (verified)

`grep -rn "scripts/"` across `.github/workflows justfile package.json apps/*/package.json
packages/*/package.json docs AGENTS.md` returns **157** raw lines. After excluding
app/package-local `scripts/` (e.g. `apps/front/scripts/`, `packages/shared-ts/scripts/`) and
historical docs (`docs/archive/**`, `docs/superpowers/reviews/**`), **129 active root-resolving
references** must be repointed to `packages/scripts-ts/src/...`. The brief's "108" is stale;
**129** is the number this spec plans against.

Breakdown (active, root-resolving):

| File | Refs |
| --- | ---: |
| `.github/workflows/front-ci.yml` | 27 |
| `justfile` | 22 |
| `package.json` (root) | 11 |
| `.github/workflows/docs-archive.yml` | 13 |
| `.github/workflows/front-e2e.yml` | 11 |
| `.github/workflows/quality-gate.yml` | 10 |
| `.github/workflows/openapi-spec-drift.yml` | 8 |
| `docs/guides/local-ci-gate.md` | 9 |
| `docs/guides/front/z-index-guard.md` | 2 |
| `docs/guides/project-conventions.md` | 1 |
| `docs/guides/ai-agent-preferences.md` | 1 |
| `docs/deployment/first-deploy-runbook.md` | 2 |
| `docs/deployment/production-deployment-design.md` | 1 |
| `AGENTS.md` | 1 |
| **Total** | **129** |

`apps/front/package.json` has 13 `scripts/` refs but npm resolves those from `apps/front`, i.e.
`apps/front/scripts/` — **out of scope** (stays put). `packages/shared-ts/package.json` has 1
`scripts/generate-zod-i18n-map.mjs` — also app/package-local, out of scope.

### 5.2 The 31 `.mjs` files

13 are runnable scripts (some with a shebang and/or exported functions); 18 are their `node --test`
suites. All are ESM (`import`/`export`, `node:` builtins).

| # | File | Purpose | Callers (active) | Tests | Node APIs used |
| -- | --- | --- | --- | --- | --- |
| 1 | `check-archive-records.mjs` | Verify docs archive records exist in git history | `docs-archive.yml`, `justfile` (`ci-docs-archive-records`), root `package.json` (`check:docs-archive-records`) | `check-archive-records.test.mjs` | `child_process.spawnSync`, `crypto.createHash`, `fs.readFileSync`/`readdirSync`, `path`, `process`, `url.pathToFileURL` |
| 2 | `check-ci-drift.mjs` | Hash-reconcile every CI step against `ci-gate-manifest.json`; fail closed on drift | `front-e2e.yml`, `front-ci.yml`, `justfile` (`ci-drift`), root `package.json`, `docs/guides/local-ci-gate.md` | `check-ci-drift.test.mjs` | `crypto.createHash`, `fs/promises.readdir`/`readFile`, `path`, `process`, `yaml.parse`; exports `findCiDrift` |
| 3 | `check-ci-gate-structure.mjs` | Pin the #1017 aggregate-gate job graph (`needs`/`if`/`permissions`/`outputs`/`id`) | `docs-archive.yml`, `front-e2e.yml`, `quality-gate.yml`, `front-ci.yml`, `openapi-spec-drift.yml`, `justfile` (`ci-drift`), `docs/guides/local-ci-gate.md` | `check-ci-gate-structure.test.mjs` | `fs/promises.readdir`/`readFile`, `path`, `process`, `yaml.parse`; exports `findCiGateStructureProblems`, `findRequiredContextCollisionProblems` |
| 4 | `check-frontend-barrels.mjs` | Forbid hand-written frontend barrel `index.ts` outside an allowlist | root `package.json` (`check:frontend-barrels`, `lint`), `docs/guides/ai-agent-preferences.md` | `check-frontend-barrels.test.mjs` | `fs/promises.readdir`, `path`, `process`, `url.fileURLToPath`; exports `allowedFrontendIndexFiles`, `findDisallowedFrontendBarrels` |
| 5 | `check-migration-expand-contract.mjs` | Enforce expand/contract migration discipline | `justfile` (`ci-migration-expand-contract`), `docs/deployment/production-deployment-design.md` | `check-migration-expand-contract.test.mjs` | `child_process.execFile`, `fs/promises.access`/`readFile`, `path`, `util.promisify`; exports `findMigrationExpandContractIssues`, `listMigrationFiles` |
| 6 | `check-oxlint-disables.mjs` | Require a reviewable reason on every `oxlint-disable` | root `package.json` (`lint:disables`), `justfile` (`ci-lint`) | `check-oxlint-disables.test.mjs` | `fs/promises.readdir`/`readFile`, `path`, `process`, `url.pathToFileURL`; exports `findOxlintDisableViolations` (imported via computed name in test) |
| 7 | `check-tree-clean.mjs` | Assert regenerated artifacts are byte-identical to HEAD (`git status --porcelain`) | `justfile` (`ci-spec-drift` path), `docs/guides/local-ci-gate.md` (via manifest reason) | `check-tree-clean.test.mjs` | `child_process.execFileSync`, `process`, `url.fileToFileURL`; exports `findTreeDrift` |
| 8 | `ci-changed-paths.mjs` | #1017 changed-path classifier; fails closed on GitHub's 3,000-file ceiling | `docs-archive.yml`, `front-e2e.yml`, `quality-gate.yml`, `front-ci.yml`, `openapi-spec-drift.yml`, `justfile` | `ci-changed-paths.test.mjs`, `ci-gate-bootstrap.test.mjs` (imports `classifyRelevance`) | `child_process.execFileSync`, `fs.appendFileSync`, `path`, `process`; exports `classifyRelevance` |
| 9 | `deploy-images.mjs` | Build/push `api`/`migrate`/`front` GHCR images from a clean worktree | `justfile` (`deploy-images`), `docs/deployment/first-deploy-runbook.md` | `deploy-images.test.mjs` | `child_process.spawnSync`, `fs.existsSync`/`readFileSync`/`rmSync`, `os.homedir`, `path`; CLI + `class RuntimeError` (no exports) |
| 10 | `lint-front.mjs` | Frontend oxlint wrapper (pwsh-safe on Windows) | `front-ci.yml`, `justfile` (`ci-lint`) | `lint-front.test.mjs` | `child_process.spawnSync`, `fs.*`, `path`, `process`, `url.fileURLToPath`; exports `normalizeRelativePath` |
| 11 | `review-api.mjs` | Orchestrate `just review-api` (spin API + deps, health check) | `justfile` (`review-api`), root `package.json` | `review-api.test.mjs`, `review-api.migration-guard.integration.test.mjs` | `child_process.spawn`/`spawnSync`, `events.once`, `fs.*`, `net.createServer`, `path`, `process`, `readline`, `url.fileURLToPath`; shebang `#!/usr/bin/env node`; imports `review-worktree.resolve.mjs` |
| 12 | `review-front.mjs` | Orchestrate `just review-front` (spin front + deps) | `justfile` (`review-front`) | **none** (covered indirectly via `review-worktree.resolve.test.mjs`) | same as `review-api.mjs`; shebang; imports `review-worktree.resolve.mjs` |
| 13 | `review-worktree.resolve.mjs` | Shared GH issue/PR + worktree resolver used by both review scripts | imported by `review-api.mjs`, `review-front.mjs` and their tests | `review-worktree.resolve.test.mjs` | none special; exports `GH_AUTH_FAILURE`, `GH_NETWORK_FAILURE`, `GH_INVOCATION_FAILURE`, `parseWorktrees`, `parseTrackedChangesFromStatus`, `getBranchPathByMap`, `resolveTarget`, `runIssueByNumber`, `runPrByNumber`; shebang |

Test-only files (no runnable sibling; migrate name + invocation): `check-archive-records.test.mjs`,
`check-ci-drift.test.mjs`, `check-ci-gate-structure.test.mjs`, `check-frontend-barrels.test.mjs`,
`check-migration-expand-contract.test.mjs`, `check-oxlint-disables.test.mjs`,
`check-tree-clean.test.mjs`, `ci-changed-paths.test.mjs`, `ci-gate-bootstrap.test.mjs`,
`ci-gate-aggregation.test.mjs`, `ci-e2e-rerun-guard.test.mjs`, `codeowners-contract.test.mjs`,
`deploy-images.test.mjs`, `lint-front.test.mjs`, `project-closure-adapter.test.mjs`,
`review-api.migration-guard.integration.test.mjs`, `review-api.test.mjs`,
`review-worktree.resolve.test.mjs`.

Two non-`.mjs` files also move: `ci-gate-manifest.json` (43 internal `scripts/` references) and
`tsconfig.lint.json` (extends `../packages/_tsconfig/tsconfig.base.json`).

### 5.3 Cross-file imports that must change extension

| Importer | Import (old → new) |
| --- | --- |
| `check-archive-records.test.mjs` | `./check-archive-records.mjs` → `./check-archive-records.ts` |
| `check-ci-drift.test.mjs` | `./check-ci-drift.mjs` → `./check-ci-drift.ts` |
| `check-ci-gate-structure.test.mjs` | `./check-ci-gate-structure.mjs` → `./check-ci-gate-structure.ts` |
| `check-frontend-barrels.test.mjs` | `./check-frontend-barrels.mjs` → `.ts` |
| `check-migration-expand-contract.test.mjs` | `./check-migration-expand-contract.mjs` → `.ts` |
| `check-tree-clean.test.mjs` | `./check-tree-clean.mjs` → `.ts` |
| `ci-changed-paths.test.mjs` | `./ci-changed-paths.mjs` → `.ts` |
| `ci-gate-bootstrap.test.mjs` | `./ci-changed-paths.mjs` → `.ts` |
| `lint-front.test.mjs` | `./lint-front.mjs` → `.ts` |
| `review-api.mjs` | `./review-worktree.resolve.mjs` → `.ts` |
| `review-front.mjs` | `./review-worktree.resolve.mjs` → `.ts` |
| `review-api.test.mjs` | `./review-api.mjs` → `.ts` |
| `review-api.migration-guard.integration.test.mjs` | `./review-api.mjs` → `.ts` |
| `review-worktree.resolve.test.mjs` | `./review-worktree.resolve.mjs` → `.ts` |
| `check-oxlint-disables.test.mjs` | computed `./check-${'oxlint'+'-disables.mjs'}` → `.ts` (dynamic `import()`) |

### 5.4 Templates (how the new package must look)

`packages/scripts-ts` follows `packages/lint-ts` (the TS template), not `packages/scripts-cs`
(which is a C# `csproj`, not a model for a TS package):

- `packages/lint-ts/package.json`: `"type": "module"`, `"scripts": { "test": "node --test \"src/**/*.test.js\"" }`, no build, `private: true`.
- `packages/scripts-ts/package.json`: `"name": "@org/scripts-ts"`, `"type": "module"`,
  `"private": true`, no `main`/`exports` needed (scripts are run by path), `"scripts": { "test": "node --test \"src/**/*.test.ts\"" }`. Dependencies: `yaml` (used by drift/structure guards) and `@types/node` (for typecheck) — `yaml` is already a root devDependency; add a package-level `devDependencies` entry so the workspace resolves it.
- `packages/scripts-ts/tsconfig.json`: extends `../_tsconfig/tsconfig.base.json`, sets
  `"types": ["node"]`, `"module": "ESNext"`, `"target": "ES2022"`, `"noEmit": true`,
  `"include": ["src/**/*.ts"]`. (Replaces root `scripts/tsconfig.lint.json`.)
- `pnpm lint` already lints `packages/*` repo-wide; no extra wiring. `oxfmt` format glob gains
  `packages/scripts-ts/**/*.{ts}`.

## 6. Drift / structure guards that assert script paths (must update in the same rung)

These four mechanisms pin `scripts/` paths and MUST move together with the files, or `just ci-drift`
/ `just ci` fails:

1. **`check-ci-drift.mjs`** — line 34: `const manifestPath = 'scripts/ci-gate-manifest.json'` →
   `'packages/scripts-ts/src/ci-gate-manifest.json'`. Line 276:
   `toPosixPath(process.argv[1]).endsWith('scripts/check-ci-drift.mjs')` →
   `...endsWith('packages/scripts-ts/src/check-ci-drift.ts')`.
2. **`check-ci-gate-structure.mjs`** — the `SELF_TEST_FILES` list (lines ~294-296) names
   `scripts/ci-changed-paths.mjs`, `scripts/check-ci-drift.mjs`, `scripts/check-ci-gate-structure.mjs`
   → `.ts` under `packages/scripts-ts/src/`. Line ~933: `step.run.includes('check-ci-gate-structure.mjs')`
   → `.ts`. Line ~1190: `endsWith('scripts/check-ci-gate-structure.mjs')` → `.ts`.
3. **`.github/CODEOWNERS`** — `/scripts/ci-*.mjs @radandevist`,
   `/scripts/check-ci-gate-structure.mjs @radandevist`, `/scripts/ci-gate-manifest.json @radandevist`
   → `/packages/scripts-ts/src/ci-*.ts`, `/packages/scripts-ts/src/check-ci-gate-structure.ts`,
   `/packages/scripts-ts/src/ci-gate-manifest.json`.
4. **`codeowners-contract.test.mjs`** — literal `/scripts/ci-*.mjs`,
   `/scripts/check-ci-gate-structure.mjs`, `/scripts/ci-gate-manifest.json` (lines ~15-17, 21-23,
   136-137) → the `packages/scripts-ts/src/...` forms.
5. **`scripts/ci-gate-manifest.json`** — 43 `scripts/<x>.mjs` occurrences. The `mirror` command
   strings are **executable and hashed**: changing a workflow `run:` block changes that step's hash,
   so each affected manifest entry's `hash` must be re-bumped after the workflow edit. The `reason`
   strings are prose and must be updated for accuracy (e.g. `base-ref/scripts/ci-changed-paths.mjs`
   → `base-ref/packages/scripts-ts/src/ci-changed-paths.ts`). Re-bump procedure: edit workflow →
   run `node packages/scripts-ts/src/check-ci-drift.ts` → paste the reported new hash into the
   manifest entry → re-run until green.

## 7. Decisions (stated for the owner)

- **File naming:** flat `src/<name>.ts`; tests `src/<name>.test.ts`. No `src/lib/` split in rung 0;
  later rungs extract shared helpers into `src/lib/`.
- **Test runner:** `node --test` (matches `packages/lint-ts`), not vitest. Native fit for
  process/spawn-heavy Node scripts.
- **How `just`/CI reference them:** `node packages/scripts-ts/src/<name>.ts` (bare `node`, no build)
  — identical execution model to today's `node scripts/<name>.mjs`. The `changes` job in
  `quality-gate.yml` checks out the classifier from the base commit; that path becomes
  `base-ref/packages/scripts-ts/src/ci-changed-paths.ts`.
- **Quality gate coverage:** `pnpm lint` (`oxlint --quiet .`) already covers `packages/*`. Confirmed
  `packages/scripts-ts` is not in any `ignorePatterns`. `oxfmt` format globs gain the package.
- **`any` forbidden:** `typescript/no-explicit-any: error` in `.oxlintrc.json`. Rung 0 types without
  `any`; `@ts-expect-error` only where a genuine edge resists, removed in later rungs.

## 8. Success criteria

- `git mv` preserves history; root `scripts/` deleted; `packages/scripts-ts` builds no emit.
- `node packages/scripts-ts/src/<name>.ts` runs identically to today under Node 24.
- `tsc --noEmit -p packages/scripts-ts/tsconfig.json` passes.
- `pnpm lint` and `pnpm --filter scripts-ts test` pass.
- `just ci-drift` (check-ci-drift + check-ci-gate-structure + codeowners-contract) passes with the
  manifest re-bumped.
- All 129 active references repointed; `apps/front/scripts/` and `packages/shared-ts/scripts/` untouched.
