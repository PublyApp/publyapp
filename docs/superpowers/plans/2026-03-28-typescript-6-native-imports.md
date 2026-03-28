# TypeScript 6 Native Imports Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the repo to TypeScript 6, remove deprecated TS path-alias config from active use, and migrate frontend-local imports to a runtime-backed `#app/*` alias while keeping existing deep workspace package imports.

**Architecture:** The migration is configuration-first. Establish the failing TS6 baseline, upgrade shared compiler settings, replace `tsconfig.paths.json` dependency with explicit frontend alias wiring, then rewrite frontend-local imports in one batch and re-run explicit project-level checks. Workspace package imports stay unchanged so the branch remains narrowly focused on TypeScript-native resolution.

**Tech Stack:** TypeScript 6, pnpm workspaces, React Router v7, Vite 7, Node ESM, PowerShell, ripgrep

---

### Task 1: Capture The Baseline And Upgrade TypeScript

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `packages/_tsconfig/tsconfig.base.json`
- Verify: `apps/front/tsconfig.json`
- Verify: `packages/shared-ts/tsconfig.json`
- Verify: `packages/client-ts/tsconfig.json`

- [ ] **Step 1: Record the failing TS5/alias baseline**

Run:

```powershell
pnpm exec tsc -p apps/front/tsconfig.json --noEmit
pnpm exec tsc -p packages/shared-ts/tsconfig.json --noEmit
pnpm exec tsc -p packages/client-ts/tsconfig.json --noEmit
make tsc-front
```

Expected:

- at least one explicit `tsc -p ...` command fails because active configs still rely on deprecated `baseUrl` and `paths`
- any additional failure is written down as baseline context before changing code

- [ ] **Step 2: Upgrade TypeScript and shared module resolution**

Edit `package.json`:

```json
"typescript": "^6.0.2"
```

Edit `packages/_tsconfig/tsconfig.base.json`:

```json
"moduleResolution": "bundler"
```

Leave these untouched in this task:

```json
"esModuleInterop": true,
"allowSyntheticDefaultImports": true
```

- [ ] **Step 3: Refresh the lockfile**

Run:

```powershell
pnpm install
```

Expected:

- `pnpm-lock.yaml` updates for the TypeScript 6 dependency graph
- no other package versions change unexpectedly beyond normal lockfile resolution noise

- [ ] **Step 4: Re-run the same explicit compiler checks**

Run:

```powershell
pnpm exec tsc -p apps/front/tsconfig.json --noEmit
pnpm exec tsc -p packages/shared-ts/tsconfig.json --noEmit
pnpm exec tsc -p packages/client-ts/tsconfig.json --noEmit
```

Expected:

- failures now isolate remaining alias/config work rather than the old `moduleResolution: "node"` setting
- any pre-existing non-TS6 error is noted separately and not hand-waved away

- [ ] **Step 5: Commit the config baseline upgrade**

Run:

```powershell
git add package.json pnpm-lock.yaml packages/_tsconfig/tsconfig.base.json
git commit -m "chore: upgrade typescript baseline to v6"
```

Expected:

- one commit containing only the TS version bump, lockfile update, and shared `moduleResolution` change

### Task 2: Remove Active Dependence On `tsconfig.paths.json`

**Files:**
- Modify: `apps/front/tsconfig.json`
- Modify: `packages/shared-ts/tsconfig.json`
- Modify: `packages/client-ts/tsconfig.json`
- Modify or Delete: `tsconfig.paths.json`

- [ ] **Step 1: Write down the active inheritance points**

Run:

```powershell
rg -n '"extends":\s*".*tsconfig\.paths\.json"' . -g "tsconfig*.json"
```

Expected:

- the command identifies `apps/front/tsconfig.json`, `packages/shared-ts/tsconfig.json`, and `packages/client-ts/tsconfig.json`

- [ ] **Step 2: Point project configs at the shared base config directly**

Edit `apps/front/tsconfig.json`:

```json
"extends": ["../../packages/_tsconfig/tsconfig.base.json"]
```

Edit `packages/shared-ts/tsconfig.json`:

```json
"extends": "../_tsconfig/tsconfig.base.json"
```

Edit `packages/client-ts/tsconfig.json`:

```json
"extends": "../_tsconfig/tsconfig.base.json"
```

Keep the existing local compiler options in each file unless they are directly replaced by later alias work.

- [ ] **Step 3: Remove deprecated alias settings from `tsconfig.paths.json`**

Preferred end state:

```text
Delete tsconfig.paths.json
```

If deletion is blocked by an unexpected remaining consumer, reduce it to a harmless transitional file with no `baseUrl` and no `paths`:

```json
{
  "extends": "tsconfig/tsconfig.base.json",
  "compilerOptions": {
    "noEmit": true
  }
}
```

- [ ] **Step 4: Run explicit type-check commands again**

Run:

```powershell
pnpm exec tsc -p packages/shared-ts/tsconfig.json --noEmit
pnpm exec tsc -p packages/client-ts/tsconfig.json --noEmit
pnpm exec tsc -p apps/front/tsconfig.json --noEmit
```

Expected:

- package configs no longer fail because they inherit deprecated `baseUrl` or `paths`
- frontend may still fail until `#app/*` resolution is wired in

- [ ] **Step 5: Commit the tsconfig inheritance cleanup**

Run:

```powershell
git add apps/front/tsconfig.json packages/shared-ts/tsconfig.json packages/client-ts/tsconfig.json tsconfig.paths.json
git commit -m "refactor: remove tsconfig path alias inheritance"
```

Expected:

- one commit containing only config inheritance changes and `tsconfig.paths.json` removal or narrowing

### Task 3: Introduce Runtime-Backed `#app/*` Resolution

**Files:**
- Modify: `apps/front/package.json`
- Modify: `apps/front/vite.config.ts`
- Modify: `apps/front/tsconfig.json`
- Verify: `apps/front/react-router.config.ts`
- Verify: `apps/front/server.js`
- Verify: `apps/front/server/app.ts`

- [ ] **Step 1: Add the app-local alias contract**

Edit `apps/front/package.json` to define package-local imports:

```json
"imports": {
  "#app/*": "./src/*"
}
```

Keep existing package metadata unchanged.

- [ ] **Step 2: Replace `vite-tsconfig-paths` with explicit alias wiring**

Edit `apps/front/vite.config.ts` imports:

```ts
import path from 'node:path';

import { fileURLToPath } from 'node:url';
```

Add a resolved frontend source path near the config root:

```ts
const frontSrcDir = fileURLToPath(new URL('./src', import.meta.url));
```

Replace the plugin-only alias behavior with explicit Vite resolution:

```ts
resolve: {
	alias: {
		'#app': frontSrcDir,
	},
},
```

Remove this import and plugin use:

```ts
import tsconfigPaths from 'vite-tsconfig-paths';
```

```ts
tsconfigPaths(),
```

- [ ] **Step 3: Teach TypeScript about `#app/*` without reviving `baseUrl`**

Edit `apps/front/tsconfig.json` and add a local package import mapping:

```json
"compilerOptions": {
  "moduleResolution": "bundler",
  "customConditions": ["development"],
  "rootDirs": [".", "./.react-router/types"]
}
```

The goal is:

- rely on package-level `"imports"` support under bundler resolution
- do not reintroduce `"baseUrl"` or `"paths"`

If `customConditions` is unnecessary after a real compiler run, omit it and keep the config minimal.

- [ ] **Step 4: Verify alias wiring before import rewrites**

Run:

```powershell
rg -n "vite-tsconfig-paths|tsconfigPaths\\(" apps/front
pnpm exec tsc -p apps/front/tsconfig.json --noEmit
make tsc-front
```

Expected:

- `vite-tsconfig-paths` is no longer used by the frontend config
- remaining frontend type errors are now import-site errors from unresolved `@/front/*`, not alias infrastructure failures

- [ ] **Step 5: Commit the alias infrastructure**

Run:

```powershell
git add apps/front/package.json apps/front/vite.config.ts apps/front/tsconfig.json
git commit -m "refactor: add runtime-backed app import alias"
```

Expected:

- one commit containing only alias infrastructure changes

### Task 4: Rewrite Frontend-Local Imports To `#app/*`

**Files:**
- Modify: `apps/front/src/**/*.ts`
- Modify: `apps/front/src/**/*.tsx`
- Modify: `apps/front/server/**/*.ts`
- Modify: `apps/front/server.js`
- Modify: `apps/front/@types/**/*.d.ts`

- [ ] **Step 1: Inventory all old frontend-local imports**

Run:

```powershell
rg -n "@/front/" apps/front
```

Expected:

- a complete list of files that still use the old alias

- [ ] **Step 2: Rewrite the import specifiers**

Use a repo-wide replacement constrained to `apps/front`:

```text
@/front/  ->  #app/
```

Examples of the exact desired result:

```ts
import { analytics } from '#app/lib/analytics/analytics';
import QueryDisplay from '#app/components/query-display';
import { useTranslate } from '#app/hooks/use-translate';
import { createClasses } from '#app/lib/mui/theme/create-classes';
```

Do not rewrite:

- `@org/shared-ts/...`
- `@org/client-ts/...`
- non-frontend aliases or bare package imports

- [ ] **Step 3: Confirm the old alias is gone**

Run:

```powershell
rg -n "@/front/" apps/front
rg -n "#app/" apps/front
```

Expected:

- first command returns no matches
- second command returns many matches across frontend source and server files

- [ ] **Step 4: Run frontend checks**

Run:

```powershell
pnpm exec tsc -p apps/front/tsconfig.json --noEmit
make tsc-front
```

Expected:

- frontend alias resolution now works through `#app/*`
- if a remaining failure appears, it is an actual type issue or baseline branch issue rather than unresolved app-local imports

- [ ] **Step 5: Commit the import rewrite**

Run:

```powershell
git add apps/front
git commit -m "refactor: migrate frontend imports to app alias"
```

Expected:

- one commit containing only the `@/front/*` -> `#app/*` rewrite and any directly coupled frontend file adjustments

### Task 5: Final Verification And Merge Readiness Notes

**Files:**
- Modify if needed: `docs/implementation-summaries/` or a branch note file only if baseline issues must be recorded
- Verify: whole working tree

- [ ] **Step 1: Run the full verification set fresh**

Run:

```powershell
pnpm exec tsc -p packages/shared-ts/tsconfig.json --noEmit
pnpm exec tsc -p packages/client-ts/tsconfig.json --noEmit
pnpm exec tsc -p apps/front/tsconfig.json --noEmit
make tsc-front
git status --short
```

Expected:

- explicit package and frontend `tsc` checks succeed
- `make tsc-front` succeeds
- working tree is clean

- [ ] **Step 2: If verification fails, classify the failure honestly**

Use this decision table:

```text
Failure mentions unresolved #app imports -> alias migration bug in this branch
Failure mentions deprecated baseUrl/paths -> config cleanup incomplete in this branch
Failure mentions unrelated generated/build artifacts that already failed on branch baseline -> pre-existing issue, document explicitly
```

Do not claim the migration is complete until fresh command output proves it.

- [ ] **Step 3: Review the final diff for scope drift**

Run:

```powershell
git diff --stat origin/feat/tenant-module-completion...HEAD
```

Expected:

- changes are limited to TS version/config, alias infrastructure, and frontend import rewrites
- no accidental package API redesign or unrelated refactors slipped in

- [ ] **Step 4: Write a concise merge summary**

Include:

```text
- TS version change
- shared moduleResolution change
- removal of active tsconfig path alias inheritance
- introduction of #app/*
- number or nature of frontend import rewrites
- final verification commands and outcomes
```

- [ ] **Step 5: Commit any final documentation only if needed**

If no extra documentation was needed:

```text
Skip this step
```

If a baseline issue had to be documented:

```powershell
git add <doc-path>
git commit -m "docs: note TS6 migration verification baseline"
```
