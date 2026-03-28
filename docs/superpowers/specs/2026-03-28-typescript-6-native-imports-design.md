# TypeScript 6 Native Imports Design

**Date:** 2026-03-28
**Branch:** `feat/upgrade-typescript-6`

## Goal

Upgrade the repo from TypeScript 5 to TypeScript 6 without using deprecated TypeScript path-alias configuration. The resulting setup should be TS6/TS7-safe, avoid `ignoreDeprecations`, keep deep workspace package imports for now, and replace frontend-local `@/front/*` imports with one runtime-backed `#app/*` alias.

## Current State

The current branch is based on `feat/tenant-module-completion` and still has the older TypeScript setup:

- Root [`package.json`](../../../package.json) pins `typescript` to `^5.9.3`
- [`packages/_tsconfig/tsconfig.base.json`](../../../packages/_tsconfig/tsconfig.base.json) still uses `"moduleResolution": "node"`
- [`tsconfig.paths.json`](../../../tsconfig.paths.json) uses deprecated `"baseUrl"` and `"paths"`
- [`apps/front/tsconfig.json`](../../../apps/front/tsconfig.json) extends [`tsconfig.paths.json`](../../../tsconfig.paths.json)
- Frontend source imports heavily use `@/front/*`
- Cross-package imports already use real workspace package names such as `@org/shared-ts/...` and `@org/client-ts/...`

## Approved Scope

This branch will:

- upgrade to TypeScript 6
- switch deprecated shared config away from `"moduleResolution": "node"`
- remove active use of TypeScript `baseUrl` and `paths`
- introduce a single frontend-local alias `#app/*`
- rewrite frontend-local imports from `@/front/*` to `#app/*`
- keep existing deep package imports such as `@org/shared-ts/lib/constants` and `@org/client-ts/src/models`
- verify with explicit `tsc -p ...` commands

This branch will not:

- add `ignoreDeprecations`
- introduce relative-only frontend imports
- redesign public package APIs with `package.json` `exports`
- rewrite deep workspace package imports

## Recommended Approach

Use a runtime-backed frontend-local alias and remove TypeScript-only aliasing entirely.

This is the smallest migration that still satisfies the repo goal:

- no deprecated TS config in active use
- one ergonomic frontend-local alias instead of long relative paths
- workspace packages remain imported by their real package names

The alternative of relative-only app imports would create unnecessary churn. The alternative of package `exports` cleanup is valid long term, but it is a broader package-boundary project and should stay out of this branch.

## Design

### 1. TypeScript configuration

Update the root TypeScript version in [`package.json`](../../../package.json) from `^5.9.3` to the current TS6 target used for this branch.

Update [`packages/_tsconfig/tsconfig.base.json`](../../../packages/_tsconfig/tsconfig.base.json):

- change `"moduleResolution": "node"` to `"bundler"`
- leave `esModuleInterop` and `allowSyntheticDefaultImports` untouched in this branch unless they are proven to block compilation after the main migration

The intent is to remove the deprecated setting that has a direct migration path now, without widening scope into import-semantics changes that are not required for this branch.

### 2. Remove TS path aliasing

[`tsconfig.paths.json`](../../../tsconfig.paths.json) currently exists only to provide aliases via:

- `"baseUrl": "."`
- `"paths": { "@/front/*": ..., "@org/shared-ts/*": ..., "@org/client-ts/*": ... }`

That file should stop participating in active TypeScript resolution for this branch.

The practical end state is:

- [`apps/front/tsconfig.json`](../../../apps/front/tsconfig.json) no longer depends on [`tsconfig.paths.json`](../../../tsconfig.paths.json) for aliasing
- workspace package imports resolve through normal package resolution
- frontend-local imports resolve through `#app/*`, not TS `paths`

If [`tsconfig.paths.json`](../../../tsconfig.paths.json) becomes unused afterward, remove it. If another config still references it for a non-deprecated reason, narrow it so it no longer defines `baseUrl` or `paths`.

### 3. Frontend-local alias

Define one app-local alias for [`apps/front`](../../../apps/front):

- `#app/*` -> frontend source root

The alias must be runtime-backed, not TypeScript-only. The exact integration points should be whatever the existing frontend toolchain needs so that:

- TypeScript resolves `#app/*`
- Vite resolves `#app/*`
- React Router build/typegen resolves `#app/*`
- Node-side frontend code that participates in the app build also resolves `#app/*`

The migration target is that frontend-local imports look like:

```ts
import QueryDisplay from '#app/components/query-display';
import { useTranslate } from '#app/hooks/use-translate';
import { getServerLoader } from '#app/lib/react-router/server-data.server';
```

### 4. Import rewrite rules

#### Frontend-local imports

Rewrite:

- `@/front/...` -> `#app/...`

Apply this consistently across frontend source, server-side frontend files, route modules, generated type shims if applicable, and any config files that participate in frontend runtime or type-checking.

#### Cross-package imports

Keep these as-is unless a local fix is required:

- `@org/shared-ts/...`
- `@org/client-ts/...`

Do not fold package API cleanup into this branch. Deep imports are intentionally accepted here.

### 5. Verification standard

The repo already showed that shortcut verification can hide TS6 config failures. This migration must use explicit project-level checks.

Minimum verification set:

- `pnpm exec tsc -p apps/front/tsconfig.json --noEmit`
- `pnpm exec tsc -p packages/shared-ts/tsconfig.json --noEmit`
- `pnpm exec tsc -p packages/client-ts/tsconfig.json --noEmit`
- `make tsc-front`

If an existing baseline issue unrelated to the migration blocks one of these commands, that issue must be called out explicitly and separated from TS6-specific regressions before merge.

## Implementation Notes

### Expected file areas

Likely files to change:

- [`package.json`](../../../package.json)
- [`pnpm-lock.yaml`](../../../pnpm-lock.yaml)
- [`packages/_tsconfig/tsconfig.base.json`](../../../packages/_tsconfig/tsconfig.base.json)
- [`tsconfig.paths.json`](../../../tsconfig.paths.json)
- [`apps/front/tsconfig.json`](../../../apps/front/tsconfig.json)
- [`apps/front/package.json`](../../../apps/front/package.json)
- frontend bundler or router config files that currently assume TS path aliases
- many files under [`apps/front/src`](../../../apps/front/src) and [`apps/front/server`](../../../apps/front/server) for import rewrites

### Risk areas

- React Router or Vite may currently rely on `vite-tsconfig-paths`; removing TS `paths` may require explicit alias configuration
- Node-side frontend entry files may need separate alias support from browser-side code
- existing baseline type-check failures on this branch must not be misdiagnosed as TS6 regressions

## Testing Strategy

1. Upgrade config first and prove the repo fails in the expected places without alias rewrites.
2. Introduce `#app/*` resolution.
3. Rewrite frontend-local imports.
4. Re-run explicit `tsc -p ...` checks.
5. Re-run `make tsc-front`.
6. If a command still fails, classify it as either:
   - migration regression
   - pre-existing branch baseline issue

## Success Criteria

This branch is ready to merge when all of the following are true:

- TypeScript 6 is installed in the repo
- active tsconfigs no longer rely on deprecated `baseUrl` or `paths`
- active shared config no longer uses deprecated `"moduleResolution": "node"`
- frontend-local imports use `#app/*`
- cross-package imports still work via real workspace package names
- no `ignoreDeprecations` was added
- explicit `tsc -p ...` verification passes, or any remaining failure is documented as a pre-existing non-TS6 issue and accepted explicitly

## Out of Scope Follow-Up

The following can be handled later in separate branches:

- package `exports` cleanup for `@org/shared-ts` and `@org/client-ts`
- removal or replacement of `esModuleInterop`
- removal or replacement of `allowSyntheticDefaultImports`
- broader import hygiene cleanup unrelated to TS6 compatibility
