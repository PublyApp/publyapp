<!-- markdownlint-disable MD010 MD013 MD032 -->

# Oxlint Disable Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce repo-owned `oxlint-disable` comments to a reviewed, justified, and guarded set.

**Architecture:** Treat this as a source hygiene project with small batches: first make the
inventory repeatable, then remove obvious bad suppressions, then audit typed helpers and React
effects separately. Generated Kiota client output under `packages/client-ts` stays out of scope.

**Tech Stack:** pnpm, oxlint 1.62.0, oxfmt, TypeScript 6, React 19, React Router v7, Zustand,
TanStack Query, PowerShell/Node-compatible repo scripts.

---

## File Structure

- Create: `scripts/check-oxlint-disables.mjs`
  - Enforces suppression quality: every source-owned `oxlint-disable` must name a rule and include
    a meaningful `-- reason`.
  - Ignores generated/client/build folders in the same spirit as `.oxlintrc.json`.
- Modify: `package.json`
  - Add `lint:disables` and include it in `lint`.
- Modify: `apps/front/@types/simplebar-react.d.ts`
  - Remove the commented-out placeholder suppressions from the dead sample declaration.
- Modify: `packages/shared-ts/utils/try-catch.ts`
  - Replace avoidable `any` aliases with safer function helper types where possible, or reword
    unavoidable call-signature forwarding suppressions.
- Modify: `packages/shared-ts/utils/any.utils.ts`
  - Tighten `Asyncfunction`, `DeepReadonly`, and `withResolvers` types.
- Modify: `packages/shared-ts/types/any.types.ts`
  - Reword or remove the remaining type-level `any` suppression after checking the actual type.
- Modify: `packages/shared-ts/@types/utils.d.ts`
  - Review declaration-only suppressions and reword legitimate type-level exceptions.
- Modify: `apps/front/src/lib/zustand/slices.ts`
  - Replace broad `Slice<any, any, any>` and variadic `any[]` with explicit generic helper types.
- Modify: `apps/front/src/lib/zustand/features/settings.slice.ts`
  - Replace `setField` value `any` with `unknown` or a narrowed settings-field value type.
- Modify: `apps/front/src/lib/react-router/safeRun.ts`
  - Replace or justify the return-value `any` in the route helper.
- Modify: `apps/front/src/lib/react-query/create-hooks.ts`
  - Validate whether the empty object type is needed; reword if it stays.
- Modify: frontend template-derived helpers:
  - `apps/front/src/components/country-select/country-select.tsx`
  - `apps/front/src/components/hook-form/form-provider.tsx`
  - `apps/front/src/components/nav-basic/utils/create-nav-item.ts`
  - `apps/front/src/components/nav-section/utils/create-nav-item.ts`
- Modify: frontend `react/exhaustive-deps` suppressions:
  - `apps/front/src/hooks/use-table-state.ts`
  - `apps/front/src/hooks/use-sync-form-to-lang.ts`
  - `apps/front/src/layouts/main/nav/mobile/nav-mobile.tsx`
  - `apps/front/src/layouts/main/nav/desktop/nav-desktop-list.tsx`
  - `apps/front/src/layouts/dashboard/nav-mobile.tsx`
  - `apps/front/src/components/editor/editor.tsx`
  - `apps/front/src/components/query-suspense-boundary.tsx`
  - `apps/front/src/components/editor/components/image-block.tsx`
  - `apps/front/src/components/editor/components/link-block.tsx`
  - `apps/front/src/components/animate/scroll-progress/use-scroll-progress.ts`
  - `apps/front/src/components/nav-basic/desktop/nav-list.tsx`
  - `apps/front/src/components/nav-basic/mobile/nav-list.tsx`
  - `apps/front/src/components/nav-section/vertical/nav-list.tsx`
  - `apps/front/src/components/nav-section/horizontal/nav-list.tsx`
  - `apps/front/src/components/nav-section/mini/nav-list.tsx`
  - `apps/front/src/lib/mui/theme/settings-tab-sync-bridge.tsx`
- Modify: one-off suppressions:
  - `apps/front/src/entry.server.tsx`
  - `apps/front/src/routes/authed/staff/profiles/details/_layout/staff-profile-details-layout.tsx`
  - `apps/front/src/routes/authed/staff/profiles/list/parts/staff-profiles-table.tsx`

## Baseline Commands

- Current actionable inventory:

```bash
rg -n --hidden \
  --glob '!.git/**' \
  --glob '!docs/superpowers/plans/**' \
  --glob '!packages/client-ts/**' \
  --glob '!node_modules/**' \
  --glob '!apps/front/.react-router/**' \
  --glob '!apps/front/build/**' \
  --glob '!apps/front/dist/**' \
  "oxlint-disable"
```

- Expected before cleanup: 48 source-owned matches.
- Verification commands after each batch:

```bash
pnpm lint
pnpm format
just tsc-front
```

## Task 1: Add A Disable Quality Guard

**Files:**
- Create: `scripts/check-oxlint-disables.mjs`
- Modify: `package.json`

- [ ] **Step 1: Create the guard script**

Create `scripts/check-oxlint-disables.mjs` with this content:

```js
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();

const ignoredSegments = new Set([
	'.git',
	'.react-router',
	'.turbo',
	'build',
	'dist',
	'node_modules',
]);

const ignoredRelativeRoots = new Set([
	'apps/api/Generated',
	'apps/api/Migrations',
	'apps/api/bin',
	'apps/api/obj',
	'apps/api/openapi',
	'docs/superpowers/plans',
	'packages/client-ts',
]);

const allowedExtensions = new Set([
	'.cjs',
	'.cts',
	'.js',
	'.jsx',
	'.mjs',
	'.mts',
	'.ts',
	'.tsx',
]);

const bannedReasonPatterns = [
	/<explanation>/i,
	/\bfor now\b/i,
	/\bsafe to use any here\b/i,
	/\bcode from template leave as is for now\b/i,
];

const isIgnoredPath = (relativePath) => {
	const normalizedPath = relativePath.split(path.sep).join('/');
	const segments = normalizedPath.split('/');

	for (const segment of segments) {
		if (ignoredSegments.has(segment)) {
			return true;
		}
	}

	for (const ignoredRoot of ignoredRelativeRoots) {
		if (
			normalizedPath === ignoredRoot ||
			normalizedPath.startsWith(`${ignoredRoot}/`)
		) {
			return true;
		}
	}

	return false;
};

const collectFiles = (directory) => {
	const files = [];

	for (const entry of readdirSync(directory)) {
		const absolutePath = path.join(directory, entry);
		const relativePath = path.relative(root, absolutePath);

		if (isIgnoredPath(relativePath)) {
			continue;
		}

		const stat = statSync(absolutePath);

		if (stat.isDirectory()) {
			files.push(...collectFiles(absolutePath));
			continue;
		}

		if (allowedExtensions.has(path.extname(entry))) {
			files.push(absolutePath);
		}
	}

	return files;
};

const failures = [];

for (const file of collectFiles(root)) {
	const relativePath = path.relative(root, file);
	const lines = readFileSync(file, 'utf8').split(/\r?\n/);

	lines.forEach((line, index) => {
		if (!line.includes('oxlint-disable')) {
			return;
		}

		const match = line.match(/oxlint-disable(?:-next-line)?\s+([^\s-]+)\s+--\s+(.+)/);

		if (!match) {
			failures.push({
				file: relativePath,
				line: index + 1,
				reason: 'must name a specific rule and include `-- reason` text',
			});
			return;
		}

		const [, ruleName, reason] = match;

		if (!ruleName.includes('/')) {
			const coreRuleNames = new Set([
				'default-param-last',
				'no-await-in-loop',
				'no-else-return',
				'no-nested-ternary',
				'no-param-reassign',
				'no-unused-vars',
			]);

			if (!coreRuleNames.has(ruleName)) {
				failures.push({
					file: relativePath,
					line: index + 1,
					reason: `rule name "${ruleName}" is not recognized by this guard`,
				});
			}
		}

		if (reason.trim().length < 24) {
			failures.push({
				file: relativePath,
				line: index + 1,
				reason: 'reason must be specific enough to review later',
			});
		}

		for (const pattern of bannedReasonPatterns) {
			if (pattern.test(reason)) {
				failures.push({
					file: relativePath,
					line: index + 1,
					reason: `reason contains banned placeholder text: ${reason.trim()}`,
				});
			}
		}
	});
}

if (failures.length > 0) {
	console.error('Found low-quality oxlint disable comments:\n');

	for (const failure of failures) {
		console.error(`${failure.file}:${failure.line} - ${failure.reason}`);
	}

	process.exit(1);
}

console.log('All oxlint disable comments include specific rules and reviewable reasons.');
```

- [ ] **Step 2: Run the guard and verify it fails on the current baseline**

Run:

```bash
node scripts/check-oxlint-disables.mjs
```

Expected: FAIL, listing at least the two `<explanation>` comments in
`apps/front/@types/simplebar-react.d.ts` and the `code from template leave as is for now`
comments.

- [ ] **Step 3: Wire the guard into package scripts**

In `package.json`, change the scripts block from:

```json
"lint": "oxlint --quiet .",
"lint:fix": "oxlint --fix --quiet .",
```

to:

```json
"lint": "oxlint --quiet . && pnpm lint:disables",
"lint:disables": "node ./scripts/check-oxlint-disables.mjs",
"lint:fix": "oxlint --fix --quiet .",
```

- [ ] **Step 4: Verify the guard remains the only expected lint failure**

Run:

```bash
pnpm lint:disables
```

Expected: FAIL with low-quality disable comments. This is acceptable until Tasks 2-6 clean or
reword the comments.

- [ ] **Step 5: Commit the guard**

```bash
git add package.json scripts/check-oxlint-disables.mjs
git commit -m "chore: guard oxlint disable comments"
```

## Task 2: Remove Placeholder And Dead Sample Suppressions

**Files:**
- Modify: `apps/front/@types/simplebar-react.d.ts`

- [ ] **Step 1: Remove the dead commented declaration block**

Replace the entire file with:

```ts
export {};
```

- [ ] **Step 2: Confirm the two placeholder suppressions are gone**

Run:

```bash
rg -n "<explanation>|apps/front/@types/simplebar-react.d.ts.*oxlint-disable" apps/front/@types/simplebar-react.d.ts
```

Expected: no output.

- [ ] **Step 3: Run typecheck**

Run:

```bash
just tsc-front
```

Expected: PASS. If this fails because the commented module declaration was needed, restore a real
module declaration without `any` placeholders and use `unknown` or library-provided SimpleBar types.

- [ ] **Step 4: Commit the cleanup**

```bash
git add apps/front/@types/simplebar-react.d.ts
git commit -m "chore: remove stale simplebar lint suppressions"
```

## Task 3: Tighten Shared Type Utilities

**Files:**
- Modify: `packages/shared-ts/utils/try-catch.ts`
- Modify: `packages/shared-ts/utils/any.utils.ts`
- Modify: `packages/shared-ts/types/any.types.ts`
- Modify: `packages/shared-ts/@types/utils.d.ts`

- [ ] **Step 1: Replace `Asyncfunction` with an unknown-safe function type**

In `packages/shared-ts/utils/any.utils.ts`, replace:

```ts
// oxlint-disable-next-line typescript/no-explicit-any -- any is the only way to do this
type Asyncfunction = (...args: any[]) => Promise<any>;
```

with:

```ts
type AsyncFunction = (...args: unknown[]) => Promise<unknown>;
```

Then update the type guard return type from:

```ts
): func is Asyncfunction => {
```

to:

```ts
): func is AsyncFunction => {
```

- [ ] **Step 2: Replace function branches in `DeepReadonly`**

In `packages/shared-ts/utils/any.utils.ts`, replace:

```ts
// oxlint-disable-next-line typescript/no-explicit-any -- any is the only way to do this
type DeepReadonly<T> = T extends (...args: any) => any
	? T
	: { readonly [P in keyof T]: DeepReadonly<T[P]> };
```

with:

```ts
type DeepReadonly<T> = T extends (...args: never[]) => unknown
	? T
	: { readonly [P in keyof T]: DeepReadonly<T[P]> };
```

- [ ] **Step 3: Replace `withResolvers` rejection type**

In `packages/shared-ts/utils/any.utils.ts`, replace:

```ts
// oxlint-disable-next-line typescript/no-explicit-any -- any is the only way to do this
let reject: (reason: any) => void;
```

with:

```ts
let reject: (reason?: unknown) => void;
```

- [ ] **Step 4: Re-run shared package type checks through the frontend**

Run:

```bash
just tsc-front
```

Expected: PASS. If TypeScript rejects the `never[]` function branch, use this exact fallback and
keep a precise suppression:

```ts
// oxlint-disable-next-line typescript/no-explicit-any -- conditional type must preserve arbitrary function parameters and return types
type DeepReadonly<T> = T extends (...args: any[]) => any
	? T
	: { readonly [P in keyof T]: DeepReadonly<T[P]> };
```

- [ ] **Step 5: Audit `try-catch.ts` with call-signature preservation**

Try replacing these aliases:

```ts
type Handler = (error: unknown) => any;
type AsyncHandler = (error: unknown) => Promise<any>;
type ErrorHandler<T extends GenericFunction = () => any> =
	ReturnType<T> extends PromiseLike<any> ? Handler | AsyncHandler : Handler;
```

with:

```ts
type Handler = (error: unknown) => unknown;
type AsyncHandler = (error: unknown) => Promise<unknown>;
type ErrorHandler<T extends GenericFunction = () => unknown> =
	ReturnType<T> extends PromiseLike<unknown> ? Handler | AsyncHandler : Handler;
```

Run:

```bash
just tsc-front
```

Expected: PASS. If wrapper callers lose return-type inference, restore only the required `any`
uses and reword each suppression to:

```ts
// oxlint-disable-next-line typescript/no-explicit-any -- wrapper must preserve arbitrary caller return types
```

- [ ] **Step 6: Reword remaining shared declaration suppressions**

In `packages/shared-ts/@types/utils.d.ts`, replace broad reasons like `Safe to use any here.` with
comments that name the type-level constraint. Use this exact wording where a suppression remains:

```ts
// oxlint-disable-next-line typescript/no-explicit-any -- global utility type must match arbitrary function signatures
```

For `typescript/no-unsafe-function-type`, use:

```ts
// oxlint-disable-next-line typescript/no-unsafe-function-type -- global helper intentionally detects broad Function-shaped values
```

For `typescript/no-unnecessary-template-expression`, keep:

```ts
// oxlint-disable-next-line typescript/no-unnecessary-template-expression -- type-level literal filtering requires the template literal form
```

- [ ] **Step 7: Verify shared suppressions**

Run:

```bash
pnpm lint:disables
pnpm lint
just tsc-front
```

Expected: `pnpm lint:disables` may still fail on frontend template comments until later tasks.
`pnpm lint` may therefore fail through the guard. `just tsc-front` must pass.

- [ ] **Step 8: Commit shared utility cleanup**

```bash
git add packages/shared-ts/utils/try-catch.ts packages/shared-ts/utils/any.utils.ts packages/shared-ts/types/any.types.ts packages/shared-ts/@types/utils.d.ts
git commit -m "chore: audit shared oxlint suppressions"
```

## Task 4: Tighten Frontend Type Suppressions

**Files:**
- Modify: `apps/front/src/lib/zustand/slices.ts`
- Modify: `apps/front/src/lib/zustand/features/settings.slice.ts`
- Modify: `apps/front/src/lib/react-router/safeRun.ts`
- Modify: `apps/front/src/lib/react-query/create-hooks.ts`
- Modify: `apps/front/src/components/country-select/country-select.tsx`
- Modify: `apps/front/src/components/hook-form/form-provider.tsx`
- Modify: `apps/front/src/components/nav-basic/utils/create-nav-item.ts`
- Modify: `apps/front/src/components/nav-section/utils/create-nav-item.ts`

- [ ] **Step 1: Replace `settings.slice.ts` placeholder `any`**

In `apps/front/src/lib/zustand/features/settings.slice.ts`, replace:

```ts
// oxlint-disable-next-line typescript/no-explicit-any -- use any for now
setField: (path: string, value: any) => void;
```

with:

```ts
setField: (path: string, value: unknown) => void;
```

- [ ] **Step 2: Verify `lodashSet` accepts `unknown`**

Run:

```bash
just tsc-front
```

Expected: PASS. If it fails because lodash's type requires a broader write value, use this exact
fallback:

```ts
// oxlint-disable-next-line typescript/no-explicit-any -- lodash set accepts arbitrary leaf values for dynamic settings paths
setField: (path: string, value: any) => void;
```

- [ ] **Step 3: Replace broad reasons in `slices.ts`**

Try typing `slicesMap` with `unknown` parameters first:

```ts
type AnySlice = Slice<string, Record<string, unknown>, Record<string, unknown>>;
```

If the `Slice` generic constraints do not accept `Record<string, unknown>`, keep the suppressions
but replace each reason with:

```ts
// oxlint-disable-next-line typescript/no-explicit-any -- slice registry stores heterogeneous Slice generic parameters
```

For the initializer arguments, prefer:

```ts
export const getInitialStore = (...args: Parameters<typeof settingsSlice.initializer>) => {
	const store: Partial<RootState> = {};

	slicesMap.forEach((slice) => {
		_.assign(store, slice.initializer(...(args as [never, never, never])));
	});

	return store;
};
```

- [ ] **Step 4: Audit `safeRun.ts`**

Open `apps/front/src/lib/react-router/safeRun.ts`. If the disabled `any` is a return type from an
unknown callback, replace it with `unknown`. If it must preserve arbitrary route callback returns,
use this exact suppression reason:

```ts
// oxlint-disable-next-line typescript/no-explicit-any -- wrapper must preserve arbitrary route callback return types
```

- [ ] **Step 5: Audit component helper `any` suppressions**

For each of these files, first try replacing `any` with `unknown` or an imported library type:

```text
apps/front/src/components/country-select/country-select.tsx
apps/front/src/components/hook-form/form-provider.tsx
apps/front/src/components/nav-basic/utils/create-nav-item.ts
apps/front/src/components/nav-section/utils/create-nav-item.ts
```

If a suppression stays, replace `code from template leave as is for now` with a rule-specific
reason. Use one of these exact forms:

```ts
// oxlint-disable-next-line typescript/no-explicit-any -- third-party component callback exposes untyped option metadata
```

```ts
// oxlint-disable-next-line typescript/no-explicit-any -- generic form provider must accept field values from any React Hook Form schema
```

```ts
// oxlint-disable-next-line typescript/no-explicit-any -- nav item factory accepts mixed template metadata until nav types are normalized
```

- [ ] **Step 6: Verify frontend type cleanup**

Run:

```bash
pnpm lint:disables
pnpm lint
just tsc-front
```

Expected: `pnpm lint:disables` may still fail on React dependency suppressions until Task 5.
`just tsc-front` must pass.

- [ ] **Step 7: Commit frontend type cleanup**

```bash
git add apps/front/src/lib/zustand/slices.ts apps/front/src/lib/zustand/features/settings.slice.ts apps/front/src/lib/react-router/safeRun.ts apps/front/src/lib/react-query/create-hooks.ts apps/front/src/components/country-select/country-select.tsx apps/front/src/components/hook-form/form-provider.tsx apps/front/src/components/nav-basic/utils/create-nav-item.ts apps/front/src/components/nav-section/utils/create-nav-item.ts
git commit -m "chore: audit frontend type suppressions"
```

## Task 5: Audit React Dependency Suppressions

**Files:**
- Modify: `apps/front/src/hooks/use-table-state.ts`
- Modify: `apps/front/src/hooks/use-sync-form-to-lang.ts`
- Modify: `apps/front/src/layouts/main/nav/mobile/nav-mobile.tsx`
- Modify: `apps/front/src/layouts/main/nav/desktop/nav-desktop-list.tsx`
- Modify: `apps/front/src/layouts/dashboard/nav-mobile.tsx`
- Modify: `apps/front/src/components/editor/editor.tsx`
- Modify: `apps/front/src/components/query-suspense-boundary.tsx`
- Modify: `apps/front/src/components/editor/components/image-block.tsx`
- Modify: `apps/front/src/components/editor/components/link-block.tsx`
- Modify: `apps/front/src/components/animate/scroll-progress/use-scroll-progress.ts`
- Modify: `apps/front/src/components/nav-basic/desktop/nav-list.tsx`
- Modify: `apps/front/src/components/nav-basic/mobile/nav-list.tsx`
- Modify: `apps/front/src/components/nav-section/vertical/nav-list.tsx`
- Modify: `apps/front/src/components/nav-section/horizontal/nav-list.tsx`
- Modify: `apps/front/src/components/nav-section/mini/nav-list.tsx`
- Modify: `apps/front/src/lib/mui/theme/settings-tab-sync-bridge.tsx`

- [ ] **Step 1: Fix `use-table-state.ts` dynamic dependency comments**

Replace the three dependency-line suppressions with stable local variables before the effect:

```ts
const sortId = sortingState[queryKeys.sorting.id];
const sortOrder = sortingState[queryKeys.sorting.order];
const pageSize = paginationState[queryKeys.pagination.pageSize];
```

Then update the effect dependency list to:

```ts
}, [paginationMode, sortId, sortOrder, pageSize]);
```

Run:

```bash
just tsc-front
pnpm lint
```

Expected: PASS for this file. If React dependency lint still complains, keep one suppression on the
effect with this reason:

```ts
// oxlint-disable-next-line react/exhaustive-deps -- cursor state must reset only when effective sort or page-size query values change
```

- [ ] **Step 2: Fix template comments in nav/editor hooks**

For each file in this task, inspect the effect body and dependency array. Apply this decision tree:

1. If the effect reads a prop, state value, or function that is not listed, add it to the dependency
   array.
2. If adding it causes a changing function dependency, wrap that function in `useCallback` at the
   definition site.
3. If the effect is intentionally one-time setup, move mutable values into `useRef` or a stable
   module helper.
4. If the suppression must stay, replace `code from template leave as is for now` with one of the
   exact reasons below.

Use these reason templates only when the invariant matches the code:

```ts
// oxlint-disable-next-line react/exhaustive-deps -- one-time listener registration uses refs to read current values
```

```ts
// oxlint-disable-next-line react/exhaustive-deps -- effect intentionally runs once to initialize third-party template behavior
```

```ts
// oxlint-disable-next-line react/exhaustive-deps -- callback identity is managed by the animation hook lifecycle
```

- [ ] **Step 3: Verify each React batch**

After every 3-4 files, run:

```bash
pnpm lint
just tsc-front
```

Expected: PASS or only failures from files not yet audited in this task.

- [ ] **Step 4: Commit React dependency audit**

```bash
git add apps/front/src/hooks/use-table-state.ts apps/front/src/hooks/use-sync-form-to-lang.ts apps/front/src/layouts/main/nav/mobile/nav-mobile.tsx apps/front/src/layouts/main/nav/desktop/nav-desktop-list.tsx apps/front/src/layouts/dashboard/nav-mobile.tsx apps/front/src/components/editor/editor.tsx apps/front/src/components/query-suspense-boundary.tsx apps/front/src/components/editor/components/image-block.tsx apps/front/src/components/editor/components/link-block.tsx apps/front/src/components/animate/scroll-progress/use-scroll-progress.ts apps/front/src/components/nav-basic/desktop/nav-list.tsx apps/front/src/components/nav-basic/mobile/nav-list.tsx apps/front/src/components/nav-section/vertical/nav-list.tsx apps/front/src/components/nav-section/horizontal/nav-list.tsx apps/front/src/components/nav-section/mini/nav-list.tsx apps/front/src/lib/mui/theme/settings-tab-sync-bridge.tsx
git commit -m "chore: audit react dependency suppressions"
```

## Task 6: Review One-Off Rule Suppressions

**Files:**
- Modify: `apps/front/src/entry.server.tsx`
- Modify: `apps/front/src/routes/authed/staff/profiles/details/_layout/staff-profile-details-layout.tsx`
- Modify: `apps/front/src/routes/authed/staff/profiles/list/parts/staff-profiles-table.tsx`

- [ ] **Step 1: Audit `no-param-reassign` in `entry.server.tsx`**

Open the surrounding code. If the reassignment mutates framework-provided state, isolate it in a
new local variable instead. If framework code requires mutation, replace the reason with:

```ts
// oxlint-disable-next-line no-param-reassign -- React Router server entry mutates framework context during response setup
```

- [ ] **Step 2: Audit `react/no-array-index-key` skeleton rows**

If the skeleton rows are static and never reordered, keep the suppression but replace the reason
with:

```ts
// oxlint-disable-next-line react/no-array-index-key -- skeleton rows are static placeholders with no item identity
```

- [ ] **Step 3: Audit `no-await-in-loop` sequential retries**

If the loop is truly rate-limited or depends on each previous request result, keep the suppression
but replace the reason with:

```ts
// oxlint-disable-next-line no-await-in-loop -- retries must run sequentially to preserve server-side ordering
```

If the loop is independent, replace it with `Promise.all` or a bounded concurrency helper.

- [ ] **Step 4: Verify one-off suppressions**

Run:

```bash
pnpm lint
just tsc-front
```

Expected: PASS.

- [ ] **Step 5: Commit one-off audit**

```bash
git add apps/front/src/entry.server.tsx apps/front/src/routes/authed/staff/profiles/details/_layout/staff-profile-details-layout.tsx apps/front/src/routes/authed/staff/profiles/list/parts/staff-profiles-table.tsx
git commit -m "chore: audit one-off oxlint suppressions"
```

## Task 7: Final Inventory And Issue Update

**Files:**
- Modify: GitHub issue `#345`

- [ ] **Step 1: Generate the final inventory**

Run:

```bash
rg -n --hidden \
  --glob '!.git/**' \
  --glob '!docs/superpowers/plans/**' \
  --glob '!packages/client-ts/**' \
  --glob '!node_modules/**' \
  --glob '!apps/front/.react-router/**' \
  --glob '!apps/front/build/**' \
  --glob '!apps/front/dist/**' \
  "oxlint-disable"
```

Expected: every remaining result has a precise rule and reviewable reason.

- [ ] **Step 2: Run final verification**

Run:

```bash
pnpm lint
pnpm format
just tsc-front
```

Expected: PASS.

- [ ] **Step 3: Update issue `#345`**

Add a completion comment or update the description with:

```markdown
## Completion Snapshot

- Final source-owned `oxlint-disable` count: run the final inventory command and paste the integer
  count from its output
- Placeholder/template reasons remaining: 0
- Guardrail added: `pnpm lint:disables`
- Verification:
  - `pnpm lint`: pass
  - `pnpm format`: pass
  - `just tsc-front`: pass
```

- [ ] **Step 4: Commit final issue notes if any repo docs changed**

If this plan is updated during execution, run:

```bash
git add docs/superpowers/plans/2026-05-01-oxlint-disable-audit.md
git commit -m "docs: plan oxlint disable audit"
```

## Self-Review

- Spec coverage: The plan covers the issue goal, all 48 source-owned suppressions, generated-client
  exclusion, guardrail work, verification commands, and issue completion.
- Placeholder scan: This document intentionally mentions banned placeholder phrases only as audit
  targets and script test fixtures. Implementation steps include exact fallback wording instead of
  vague future work.
- Type consistency: Script names, package scripts, file paths, commands, and issue number are
  consistent across tasks.
