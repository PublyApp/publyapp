# scripts-ts Workspace Package Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the repo-root `scripts/` (31 `.mjs` + `ci-gate-manifest.json` + `tsconfig.lint.json`) into a first-class pnpm workspace package `packages/scripts-ts`, written exclusively in TypeScript, runnable with bare `node` (Node 24 type stripping), typechecked, linted, and tested with the repo-wide gate — without a build step.

**Architecture:** A no-build `type: module` package at `packages/scripts-ts`. Source lives flat in `src/*.ts` (tests `src/*.test.ts`). Scripts are invoked from CI/justfile as `node packages/scripts-ts/src/<name>.ts` exactly as today's `node scripts/<name>.mjs`. `pnpm lint` (repo-wide `oxlint --quiet .`) already covers `packages/*`, so no new lint wiring is needed beyond the `oxfmt` format glob. Rung 0 moves files verbatim (renamed `.ts`, minimally typed, no `any`) and repoints every reference plus the four path-asserting guards; later rungs harden groups to strict TypeScript and remove `@ts-expect-error`.

**Tech Stack:** Node 24 (native type stripping), pnpm workspaces, TypeScript 7 (`tsc --noEmit`), `oxlint` + `oxfmt`, vitest (Node built-in test runner), `yaml`.

## Global Constraints

- Node floor **24.x** (`.nvmrc` = `24.x`, `.node-version` = `v24.x`), CI `node-version: 24`, Dockerfiles `node:24-alpine`. No script runs on another Node. [issue #1181]
- **Erasable syntax only** in `packages/scripts-ts`: no `enum`, no `namespace`, no parameter properties, no emit-requiring decorators. Node 24 strips only types. [issue #1181]
- `tsc --noEmit` passes under `packages/_tsconfig/tsconfig.base.json` (`strict`, `noUnusedLocals`, `noUnusedParameters`, `noImplicitAny` via strict). [repo base]
- `typescript/no-explicit-any: error` — `any` is forbidden. Type with `unknown` / `Record<string, unknown>` / explicit param types. `@ts-expect-error` allowed only where a rung-0 edge resists typing, removed in a later rung. [`.oxlintrc.json`]
- Package name **`@org/scripts-ts`**. [issue #1181]
- Test runner **vitest** — owner decision 2026-08-22 ("vitest partout": shared-ts already, lint-ts converts in #1201, scripts-ts here). Rung 0 converts every `*.test.mjs` from `node:test` to vitest (`import { describe, test, expect } from 'vitest'`; `node:assert` calls may stay or become `expect` — keep assertions semantically identical). `vitest.config.ts` mirrors `packages/shared-ts` (environment node, `include: ['src/**/*.test.ts']`), devDependency pinned to the same version as shared-ts. [issue #1181, owner]
- `pnpm lint` (`oxlint --quiet .`) already covers `packages/*`; add `packages/scripts-ts/**/*.{ts}` to `oxfmt` globs. [`.oxlintrc.json`, root `package.json`]
- `just ci-drift` (check-ci-drift + check-ci-gate-structure + codeowners-contract) and the manifest must stay green. [issue #1181]
- Every reference updates in the same PR as its move. Verified count: **119 active root-resolving references** (brief's "108" is stale). [this spec §5.1]

---

### Task 0: Scaffold `packages/scripts-ts` and `git mv` the files

**Files:**
- Create: `packages/scripts-ts/package.json`
- Create: `packages/scripts-ts/tsconfig.json`
- Move (git mv): `scripts/*.mjs` → `packages/scripts-ts/src/*.ts` (31 files)
- Move: `scripts/ci-gate-manifest.json` → `packages/scripts-ts/src/ci-gate-manifest.json`
- Move: `scripts/tsconfig.lint.json` → `packages/scripts-ts/tsconfig.json` (superseded by new tsconfig; see content below)
- Delete: root `scripts/` (after move)

**Interfaces:**
- Consumes: nothing (scaffold-first task).
- Produces: a workspace package containing all 31 scripts as `.ts`, runnable via `node packages/scripts-ts/src/<name>.ts`.

- [ ] **Step 1: Create `packages/scripts-ts/package.json`**

```json
{
	"name": "@org/scripts-ts",
	"version": "0.0.0",
	"private": true,
	"type": "module",
	"description": "Repo CI/review/deploy scripts as a TypeScript-only pnpm workspace package (run with bare node on Node 24).",
	"scripts": {
		"test": "vitest run"
	},
	"devDependencies": {
		"yaml": "2.8.3",
		"@types/node": "^20.19.7"
	}
}
```

- [ ] **Step 2: Create `packages/scripts-ts/tsconfig.json`**

```json
{
	"extends": "../_tsconfig/tsconfig.base.json",
	"compilerOptions": {
		"allowJs": false,
		"checkJs": false,
		"declaration": false,
		"module": "ESNext",
		"noEmit": true,
		"target": "ES2022",
		"types": ["node"]
	},
	"include": ["src/**/*.ts"],
	"exclude": ["node_modules"]
}
```

- [ ] **Step 3: Move files with `git mv` (preserves history)**

Run:

```bash
mkdir -p packages/scripts-ts/src
cd scripts
for f in *.mjs; do
  git mv "$f" "../packages/scripts-ts/src/${f%.mjs}.ts"
done
git mv ci-gate-manifest.json ../packages/scripts-ts/src/ci-gate-manifest.json
cd ..
rmdir scripts 2>/dev/null || true
```

Expected: `git status` shows 33 renames (`R100`) from `scripts/` to `packages/scripts-ts/src/`, and `scripts/` no longer exists.

- [ ] **Step 4: Fix internal `.ts` import extensions (see spec §5.3)**

In each test/script, rewrite sibling `.mjs` imports to `.ts`. For example, in `packages/scripts-ts/src/check-archive-records.test.ts`:

```ts
import { runCheck } from './check-archive-records.ts';
```

Apply the same rename to every entry in spec §5.3 (check-ci-drift, check-ci-gate-structure, check-frontend-barrels, check-migration-expand-contract, check-tree-clean, ci-changed-paths, ci-gate-bootstrap, lint-front, review-api, review-api.*.test, review-worktree.resolve, review-front, review-worktree.resolve.test, and the computed `./check-${'oxlint'+'-disables.ts'}` dynamic import in check-oxlint-disables.test.ts).

- [ ] **Step 5: Add a minimal type annotation to each script entrypoint so `tsc --noEmit` passes**

Add explicit parameter types to the top-level `process.argv` reads and any exported function signatures. The repo base is `strict` with `noImplicitAny`, so every exported function (see spec §5.2) must declare param/return types. Example for `check-archive-records.ts`:

```ts
export const runCheck = async (rootDir: string): Promise<Array<string>> => {
	// ...existing body...
};
```

Do NOT use `any`. Where a value is untyped, type it as `unknown` and narrow. Where a rung-0 edge genuinely resists, add `// @ts-expect-error <reason>` and record it in the rung summary; a later rung removes it.

- [ ] **Step 6: Typecheck the package**

Run: `node --version` (expect v24.x) then `cd packages/scripts-ts && npx tsc --noEmit -p tsconfig.json`

Expected: no errors. If `yaml` types are unresolved, confirm `pnpm install` resolved the workspace dep; the `devDependencies` entry in Step 1 covers it.

- [ ] **Step 7: Smoke-run one moved script**

Run: `node packages/scripts-ts/src/check-frontend-barrels.ts`

Expected: exits 0 (no disallowed barrels on a clean tree). This proves `node file.ts` works under Node 24.

- [ ] **Step 8: Commit**

```bash
git add packages/scripts-ts scripts docs
git commit -m "chore(scripts-ts): scaffold package and git-mv scripts/ as .ts"
```

---

### Task 1: Repoint the 129 active references (no code change to script bodies)

**Files:**
- Modify: `justfile` (22 refs)
- Modify: `package.json` (root) (11 refs)
- Modify: `.github/workflows/front-ci.yml` (27 refs)
- Modify: `.github/workflows/docs-archive.yml` (13 refs)
- Modify: `.github/workflows/front-e2e.yml` (11 refs)
- Modify: `.github/workflows/quality-gate.yml` (10 refs)
- Modify: `.github/workflows/openapi-spec-drift.yml` (8 refs)
- Modify: `docs/guides/local-ci-gate.md` (9 refs)
- Modify: `docs/guides/front/z-index-guard.md` (2), `docs/guides/project-conventions.md` (1), `docs/guides/ai-agent-preferences.md` (1)
- Modify: `docs/deployment/first-deploy-runbook.md` (2), `docs/deployment/production-deployment-design.md` (1)
- Modify: `AGENTS.md` (1)

**Interfaces:**
- Consumes: the moved files from Task 0 (exact names under `packages/scripts-ts/src/`).
- Produces: every `scripts/<x>.mjs` reference now reads `packages/scripts-ts/src/<x>.ts`.

- [ ] **Step 1: Rewrite root `package.json` script entries**

In root `package.json`, change every `scripts/<x>.mjs` to `packages/scripts-ts/src/<x>.ts`. Concretely, edit these `scripts` values:

```
"check:frontend-barrels": "node ./packages/scripts-ts/src/check-frontend-barrels.ts",
"check:docs-archive-records": "node ./packages/scripts-ts/src/check-archive-records.ts",
"lint:disables": "node ./packages/scripts-ts/src/check-oxlint-disables.ts",
"lint:fix": "oxlint --fix --quiet . && pnpm check:frontend-barrels",
"test:ci-drift": "pnpm --filter scripts-ts exec vitest run src/check-ci-drift.test.ts",
"test:review-worktree-resolution": "pnpm --filter scripts-ts exec vitest run src/review-worktree.resolve.test.ts",
"test:review-api": "pnpm --filter scripts-ts exec vitest run src/review-api.test.ts",
"test:review-api-migration-guard": "pnpm --filter scripts-ts exec vitest run src/review-api.migration-guard.integration.test.ts",
"test:frontend-barrels": "pnpm --filter scripts-ts exec vitest run src/check-frontend-barrels.test.ts",
"test:project-closure-adapter": "pnpm --filter scripts-ts exec vitest run src/project-closure-adapter.test.ts"
```

- [ ] **Step 2: Rewrite `justfile` references**

For every `node scripts/<x>.mjs` line in `justfile`, replace with `node packages/scripts-ts/src/<x>.ts`. The affected recipes: `review-front`, `review-api`, `deploy-images`, `ci-docs-archive-records`, `ci-lint` (`node scripts/lint-front.mjs --quiet` → `node packages/scripts-ts/src/lint-front.ts --quiet`), `ci-drift`, `ci-migration-expand-contract`, `ci-spec-drift` (`node ./scripts/check-tree-clean.mjs ...` → `node ./packages/scripts-ts/src/check-tree-clean.ts ...`), and the `node --test ./scripts/codeowners-contract.test.mjs` line → `pnpm --filter scripts-ts exec vitest run src/codeowners-contract.test.ts`.

- [ ] **Step 3: Rewrite workflow files**

In each `.github/workflows/*.yml`, replace `scripts/<x>.mjs` with `packages/scripts-ts/src/<x>.ts` and `scripts/ci-changed-paths.mjs` (base-pinned `base-ref/scripts/...`) with `base-ref/packages/scripts-ts/src/ci-changed-paths.ts`. Pay special attention to `quality-gate.yml`'s `changes` job, which does `sparse-checkout: scripts/ci-changed-paths.mjs` → `packages/scripts-ts/src/ci-changed-paths.ts` and sets `CLASSIFIER=base-ref/packages/scripts-ts/src/ci-changed-paths.ts`.

- [ ] **Step 4: Rewrite docs references**

Update the `docs/guides/*` and `docs/deployment/*` and `AGENTS.md` paths. In `AGENTS.md`, change
`scripts/ci-gate-manifest.json` → `packages/scripts-ts/src/ci-gate-manifest.json` (line ~109). In `docs/guides/local-ci-gate.md`, repoint each `scripts/<x>.mjs` (9) to the `.ts` form. In `docs/guides/front/z-index-guard.md`, `project-conventions.md`, `ai-agent-preferences.md`, `docs/deployment/first-deploy-runbook.md`, `production-deployment-design.md`, apply the same.

- [ ] **Step 5: Verify no stale root `scripts/` references remain (excluding app/package-local)**

Run:

```bash
grep -rn "scripts/" .github/workflows justfile package.json docs AGENTS.md \
  | grep -vE "apps/[a-z-]+/scripts/|packages/[a-z-]+/scripts/" \
  | grep -c "scripts/"
```

Expected: `0`. (Any remaining hits are either `apps/front/scripts/` or `packages/shared-ts/scripts/`, which are out of scope and must stay.)

- [ ] **Step 6: Commit**

```bash
git add justfile package.json .github docs AGENTS.md
git commit -m "chore(scripts-ts): repoint 129 references from scripts/ to packages/scripts-ts/src"
```

---

### Task 2: Update the four path-asserting guards + CODEOWNERS + manifest

**Files:**
- Modify: `packages/scripts-ts/src/check-ci-drift.ts` (manifestPath, self-path endsWith)
- Modify: `packages/scripts-ts/src/check-ci-gate-structure.ts` (SELF_TEST_FILES, step.run includes, self-path endsWith)
- Modify: `.github/CODEOWNERS`
- Modify: `packages/scripts-ts/src/codeowners-contract.ts`
- Modify: `packages/scripts-ts/src/ci-gate-manifest.json` (43 `scripts/` strings + re-bumped hashes)

**Interfaces:**
- Consumes: moved files from Task 0.
- Produces: green `just ci-drift` (drift + structure + codeowners-contract).

- [ ] **Step 1: Update `check-ci-drift.ts`**

Change line 34:

```ts
const manifestPath = 'scripts/ci-gate-manifest.json';
```

to:

```ts
const manifestPath = 'packages/scripts-ts/src/ci-gate-manifest.json';
```

Change the self-path assertion (≈line 276):

```ts
toPosixPath(process.argv[1]).endsWith('scripts/check-ci-drift.mjs');
```

to:

```ts
toPosixPath(process.argv[1]).endsWith('packages/scripts-ts/src/check-ci-drift.ts');
```

- [ ] **Step 2: Update `check-ci-gate-structure.ts`**

In the `SELF_TEST_FILES` array (≈lines 294-296), change:

```ts
'scripts/ci-changed-paths.mjs',
'scripts/check-ci-drift.mjs',
'scripts/check-ci-gate-structure.mjs',
```

to the `.ts` forms under `packages/scripts-ts/src/`. Change the step-run assertion (≈line 933):

```ts
step.run.includes('check-ci-gate-structure.mjs')
```

to:

```ts
step.run.includes('check-ci-gate-structure.ts')
```

Change the self-path assertion (≈line 1190):

```ts
toPosixPath(process.argv[1]).endsWith('scripts/check-ci-gate-structure.mjs');
```

to:

```ts
toPosixPath(process.argv[1]).endsWith('packages/scripts-ts/src/check-ci-gate-structure.ts');
```

- [ ] **Step 3: Update `.github/CODEOWNERS`**

```
/scripts/ci-*.mjs @radandevist
/scripts/check-ci-gate-structure.mjs @radandevist
/scripts/ci-gate-manifest.json @radandevist
```

to:

```
/packages/scripts-ts/src/ci-*.ts @radandevist
/packages/scripts-ts/src/check-ci-gate-structure.ts @radandevist
/packages/scripts-ts/src/ci-gate-manifest.json @radandevist
```

- [ ] **Step 4: Update `codeowners-contract.ts`**

In `packages/scripts-ts/src/codeowners-contract.ts`, change the literal paths at lines ~15-17, ~21-23, and the assertions at ~136-137 from `/scripts/ci-*.mjs`, `/scripts/check-ci-gate-structure.mjs`, `/scripts/ci-gate-manifest.json` to the `packages/scripts-ts/src/...` forms.

- [ ] **Step 5: Repoint `ci-gate-manifest.json` prose + re-bump hashes**

In `packages/scripts-ts/src/ci-gate-manifest.json`:
- Replace all 43 `scripts/<x>.mjs` occurrences (including `base-ref/scripts/ci-changed-paths.mjs`) with `packages/scripts-ts/src/<x>.ts`. The `mirror` command strings (e.g. `node --test scripts/ci-gate-bootstrap.test.mjs`) become `pnpm --filter scripts-ts exec vitest run src/ci-gate-bootstrap.test.ts`.
- For every manifest entry whose `mirror`/workflow `run:` block changed, the workflow step hash must be re-bumped: run `node packages/scripts-ts/src/check-ci-drift.ts`, read the reported new hashes, paste them into the matching entries, repeat until the guard reports no drift.

- [ ] **Step 6: Run the drift + structure + codeowners guards**

Run:

```bash
node packages/scripts-ts/src/check-ci-drift.ts
node packages/scripts-ts/src/check-ci-gate-structure.ts
pnpm --filter scripts-ts exec vitest run src/codeowners-contract.test.ts
```

Expected: all three exit 0 (green).

- [ ] **Step 7: Commit**

```bash
git add packages/scripts-ts/src/check-ci-drift.ts packages/scripts-ts/src/check-ci-gate-structure.ts \
        packages/scripts-ts/src/codeowners-contract.ts packages/scripts-ts/src/ci-gate-manifest.json \
        .github/CODEOWNERS
git commit -m "chore(scripts-ts): update drift/structure/codeowners guards + re-bump manifest"
```

---

### Task 3: Wire `oxfmt` format glob and verify the whole gate is green

**Files:**
- Modify: `package.json` (root) `format` and `format:write` scripts (add `packages/scripts-ts/**/*.{ts}`)
- Modify: nothing else

**Interfaces:**
- Consumes: moved files from Task 0.
- Produces: `pnpm lint` and `pnpm --filter scripts-ts test` cover the new package; `just ci` green.

- [ ] **Step 1: Add the package to `oxfmt` globs**

In root `package.json`, append `\"packages/scripts-ts/**/*.{ts}\"` to both `format` and `format:write` scripts (alongside the existing `packages/lint-ts/**/*.{js,mjs,cjs,json}` glob).

- [ ] **Step 2: Run the local quality gate**

Run:

```bash
pnpm lint
pnpm --filter scripts-ts test
pnpm --filter scripts-ts test
```

Expected: `pnpm lint` exits 0; the vitest suite passes.

- [ ] **Step 3: Run `just ci` to confirm the aggregate gate is green**

Run: `just ci` (mirrors CI). Expected: every sub-gate green, including `ci-drift` (Tasks 1-2).

- [ ] **Step 4: Commit**

```bash
git add package.json
git commit -m "chore(scripts-ts): include package in oxfmt format glob; verify gate green"
```

---

### Task 4 (Rung 1+): Harden the CI-gate group to strict TypeScript

> Executed in a later PR (per the ladder). Shown so the plan is complete; not part of PR0.

**Files:**
- Modify: `packages/scripts-ts/src/check-ci-drift.ts`, `check-ci-gate-structure.ts`, `ci-changed-paths.ts`, `ci-gate-bootstrap.test.ts`, `ci-gate-aggregation.test.ts`, `ci-e2e-rerun-guard.test.ts`, `codeowners-contract.ts`

**Interfaces:**
- Consumes: Task 0 scaffolding.
- Produces: removed `@ts-expect-error` from the CI-gate group; shared helpers extracted to `src/lib/`.

- [ ] **Step 1: Remove every `@ts-expect-error` in the CI-gate group, replacing with real types**

For each `// @ts-expect-error <reason>` added in Task 0 Step 5, give the symbol an explicit type
(`unknown` narrowed, or a typed wrapper around the `yaml` parse result) and delete the directive.
Run `tsc --noEmit` to confirm no new errors.

- [ ] **Step 2: Extract repeated helpers into `src/lib/`**

Move duplicated path/posix logic (e.g. `toPosixPath`, `getRelativePath`) into
`packages/scripts-ts/src/lib/paths.ts` and import it. Add `src/lib/paths.test.ts` covering each helper.

- [ ] **Step 3: Run the group's tests + `just ci`**

Run:

```bash
node packages/scripts-ts/src/check-ci-drift.ts
node packages/scripts-ts/src/check-ci-gate-structure.ts
pnpm --filter scripts-ts exec vitest run src/ci-*.test.ts src/codeowners-contract.test.ts
```

Expected: green.

- [ ] **Step 4: Commit**

```bash
git add packages/scripts-ts
git commit -m "refactor(scripts-ts): strict-typed CI-gate group; extract path helpers"
```

---

### Task 5 (Rung 2+): Harden review/deploy/guard groups

> Later PRs, same shape as Task 4, grouped by caller: review tooling (`review-api`, `review-front`, `review-worktree.resolve`), deploy (`deploy-images`), and the remaining guards (`check-archive-records`, `check-frontend-barrels`, `check-migration-expand-contract`, `check-oxlint-disables`, `check-tree-clean`, `lint-front`). Each rung: remove `@ts-expect-error`, type exported functions, add `src/lib/*` helpers where shared, keep `node --test` green, `just ci` green.

(No placeholder steps — each follows Task 4's four steps verbatim against its file group. The plan states this explicitly rather than repeating identical code per group, per the "repeat the code" warning: the implementer mirrors Task 4's concrete steps for the named files.)

---

## Self-Review (against the spec)

**1. Spec coverage.**
- §5.1 (129 refs) → Task 1 + AGENTS.md. Covered.
- §5.2 (31 files) → Task 0 `git mv`. Covered (33 renames incl. manifest + tsconfig).
- §5.3 (import extensions) → Task 0 Step 4. Covered.
- §5.4 (template) → Task 0 Steps 1-2. Covered.
- §6 (guards) → Task 2. Covered (drift, structure, codeowners, manifest re-bump).
- §7 (decisions) → encoded in Global Constraints + Task steps (`.ts` naming, vitest, `node --test`, `node packages/scripts-ts/src/x.ts`, `pnpm lint` covers `packages/*`). Covered.
- §8 (success) → Task 3 gate verification. Covered.

**2. Placeholder scan.** No "TBD"/"implement later"/"similar to Task N" without concrete code. Task 5 references Task 4's concrete four steps rather than eliding them; that is deliberate cross-reference, not a placeholder.

**3. Type consistency.** File names are consistent across tasks: `packages/scripts-ts/src/<name>.ts` everywhere; imported names match spec §5.2 exports; `ci-gate-manifest.json` path is identical in Task 0/1/2. No rename drift.
