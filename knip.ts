import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { KnipConfig } from 'knip';

// --- Dynamic guard extraction from apps/front/package.json ---
// All guard scripts are invoked via run-guarded.mts (issue #1525 timeout
// wrapper). knip traces run-guarded.mts as the entry point from package.json
// but cannot follow the dynamic script-path argument to discover each guard
// as a separate entry. We extract the guard paths dynamically from
// package.json so that removing a guard from package.json and forgetting to
// delete the file makes knip report it as unused — the paired-proof
// requirement. A static list here would be a silent lie: knip would stay
// green even after a guard is dropped from the scripts.

const frontPkgPath = join('apps', 'front', 'package.json');
const frontPkg = JSON.parse(readFileSync(frontPkgPath, 'utf8')) as {
	scripts?: Record<string, string>;
};

const guardPaths = new Set<string>();
// Capture every path argument after `run-guarded.mts` (optionally `--test`),
// stopping at shell operators (&, |, ;) and at the `--` passthrough marker
// (after `run-guarded.mts -- <command>` the tokens are a wrapped non-node
// command line — vitest/playwright — not guard paths; capturing them would
// add `vitest`, `run`, config files etc. as bogus entries). Some invocations
// pass multiple files to a single run-guarded.mts call (e.g.
// test:route-tree-guard), so we must grab them all, not just the first.
const re = /run-guarded\.mts(?:\s+--test)?((?:\s+[^\s&|;]+)+?)(?=\s+--\s|$)/g;
for (const script of Object.values(frontPkg.scripts ?? {})) {
	let m: RegExpExecArray | null;
	while ((m = re.exec(script)) !== null) {
		for (const arg of m[1].trim().split(/\s+/)) {
			guardPaths.add(arg);
		}
	}
}
const dynamicGuards = [...guardPaths].sort();

const config: KnipConfig = {
	// Vendored upstream plugin code (dmmulroy/anti-slop @ 6d53855) is outside
	// the house dependency graph — same policy as when it lived under tools/,
	// which knip never scanned. See packages/lint-ts/src/anti-slop/README.md.
	ignore: ['packages/lint-ts/src/anti-slop/**'],
	workspaces: {
		'.': {
			// `just` is a system binary (extractions/setup-just in CI, brew/pkg
			// locally), not an npm package: quality-gate.yml's
			// `pnpm exec just test-analyzers` legitimately resolves it from PATH.
			ignoreBinaries: ['just'],
			// `winston-transport-browserconsole` is declared in
			// packages/shared-ts/package.json but never imported directly:
			// winston resolves it at runtime as an optional browser transport,
			// so knip cannot trace the import. It matches develop's declared
			// dependency set (kept deliberately), so it is ignored here rather
			// than removed from the manifest.
			// `lint-staged` is invoked by the versioned .husky/pre-commit hook
			// (`pnpm exec lint-staged`, issue #1852). knip only scanned that
			// hook while the `husky` package was a dependency (its husky plugin
			// gates on it); with husky removed, the hook is invisible to
			// dependency tracing, so the real usage is declared here. The
			// lint-staged plugin still resolves oxfmt/dotnet from
			// .lintstagedrc.js, so those stay covered.
			ignoreDependencies: ['winston-transport-browserconsole', 'lint-staged'],
		},
		'apps/api': {
			entry: 'run-dev.mjs',
		},
		'apps/front': {
			entry: [
				// Runtime-discovered files knip cannot trace. One line per file,
				// never a blanket ignore of a whole app.
				'deploy/request-counter/server.mjs', // e2e sidecar service built from deploy/request-counter by docker-compose.test.yml
				'e2e/helpers/entity-crumb-render-target.tsx', // loaded via vite.ssrLoadModule() by URL from e2e/helpers/render-entity-crumb.ts, never imported
				'e2e/helpers/render-focus-ring-target.tsx', // loaded via vite.ssrLoadModule() by URL from e2e/helpers/render-focus-ring.ts, never imported
				'e2e/helpers/data-table-icon-guard-target.tsx', // loaded via vite.ssrLoadModule() by URL from e2e/helpers/render-data-table-icon-guard.ts (real DataTable SSR markup for the #1799 spec), never imported
				'e2e/helpers/icon-guard-browser-entry.ts', // bundled by esbuild (string entryPoints path) from e2e/helpers/render-data-table-icon-guard.ts for the #1799 spec's in-page real guard, never imported
				// Derives the per-worktree Compose project name and reserves the port
				// band (#1642). It has no CLI of its own: the justfile shells out to
				// `node apps/front/scripts/run-e2e-front.mts`, which imports this
				// module. Its co-located e2e-compose-env.test.mts runs via
				// `pnpm test:e2e-compose-env`.
				'scripts/e2e-compose-env.mts',
				// Spawned by path from run-e2e-front.signal.test.mts so the real
				// runner can be interrupted from a parent process; not imported because
				// importing it would execute the test harness in-process.
				'scripts/run-e2e-front.signal-harness.mts',
				// Spawned by path (one OS process per contender) from
				// e2e-compose-env.test.mts's contention proof, so two real processes
				// collide inside the shipped reservation helper and hold their leases
				// at the same time. Not imported: importing it would run the
				// contention in-process, which is exactly what the proof must avoid.
				'scripts/e2e-compose-env.contention-harness.mts',
				'scripts/generate/generate-route-tree.mts', // documented shim kept after #1300 moved the implementation to route-tree-generator.mts
				'scripts/generate/generate-suppression-inventory.mts', // manual generator; check-design-system.mts tells humans to run it when the inventory drifts
				'tools/ci/node-24-type-stripping.mts', // manual proof runner; its sibling node-24-type-stripping.test.mts pins it
				// Public-API type probe target. The co-located .test.mts compiles
				// a real consumer against this module's surface (mintSpans,
				// SourceSpan, CopyAttribution) and pins the removed
				// position-key mechanism's absence — without this entry, knip
				// reports those re-exports as unused even though the test
				// imports them type-only. The hand-written .d.mts was retired
				// in #1449 (scripts/ -> tools/ move); the public type surface
				// now flows through the source.
				'tools/vite/check-context-chunk-isolation.mts',
				// Compile-time-only typecheck proof for Distribute<T> (#1755):
				// part of the main tsconfig program (`tsc --noEmit` compiles
				// it), never imported at runtime by design — its probes are
				// compile-time assignments, so knip can never trace usage
				// through an import. Same class as the type-probe targets
				// above (check-context-chunk-isolation.mts): an entry, not an
				// ignore, so the file stays in the knip surface.
				'src/components/table/column-distribute.typecheck.ts',
				'src/components/ui/drawer-guard-tmp-dir.cjs', // string-keyed require() from drawer-form.test.tsx / the drawer guard, invisible to import analysis
				// Used via CLI `--config` argument, not imported: replay config
				// for kept red tests under apps/front/tests/proofs/ (issue #1659).
				// Knip cannot trace CLI-argument usage. Now wired: `just test-preuves`
				// (recipe in justfile) and the `Verify paired red proofs` step in
				// front-ci.yml::supply-chain both invoke it through
				// `pnpm --filter front test:preuves` → scripts/ci/run-preuves.mts.
				// When no PRs declare proofs (no files added/modified under tests/proofs/),
				// the runner prints an explicit no-op message and exits 0.
				'vitest.preuves.config.ts',
				// Versioned kept-red proof test files (issue #1659). These are
				// replayed by vitest.preuves.config.ts as explicit file arguments,
				// not via the include glob, so knip cannot trace them. Declared
				// as a glob pattern so future proof files are covered without
				// updating this list — a proof file the guard cannot replay
				// fails the step loud, never silently drops out of knip.
				'tests/proofs/**/*.test.ts',
				'tests/proofs/**/*.test.tsx',
				// Dynamic guard entries extracted from apps/front/package.json.
				// These are the scripts invoked via run-guarded.mts. Removing a
				// guard from package.json drops it from this list, so knip
				// reports the file as unused — the paired-proof guarantee.
				...dynamicGuards,
			],
			// System binary invoked via execFileSync by the request-counter sidecar
			// to mint its throwaway TLS cert; not an npm package.
			// `ss` is a system binary invoked via execFileSync by
			// scripts/e2e-compose-env.mts to name the holder of an occupied port
			// (`ss -tlnp`, issue #1698); not an npm package. (`docker` resolves
			// through the repo's existing docker usage and stays covered.)
			// `pgrep`/`pkill` are gone: the E2E signal spec now identifies its
			// child tree by exact PID (a ready file plus process.kill(pid, 0))
			// instead of matching argv text across the whole host.
			ignoreBinaries: ['openssl', 'ss'],
			// #1758: server.mjs imports the built server bundle through the
			// `#server-build` package-imports alias so tsconfig.server.json can
			// typecheck it without pulling build output into the program. Node
			// resolves the alias's `default` condition to ./dist/server/server.js
			// at runtime and tsc resolves its `types` condition to
			// types/server-build.d.ts; knip does neither, and dist/ is build
			// output absent from a clean checkout, so it reports the import as
			// unresolved. Scoped to this one specifier: any other unresolved
			// import still fails knip loud.
			ignoreUnresolved: ['#server-build'],
			// Scoped knip gaps carried by upstream develop (verified: `pnpm exec
			// knip` against origin/develop reports the same two symbols). Each is a
			// single, pre-existing develop export knip flags as unused — surfaced on
			// this lane only because #1554 (mutation-invalidation coherence) merged
			// develop's knip gate onto the tree. Scoped to the exact file + the
			// specific issue type so any newly-added gap in those files still fails
			// knip loudly. No blanket file/directory ignore.
			ignoreIssues: {
				// tenant-posts.ts — post-create/edit drawer mocks `savePost`
				// directly (apps/front/src/routes/authed/tenant/posts/_create-post-drawer.tsx,
				// .../$postId/edit.tsx); the `useSavePostMutation` wrapper is exported
				// but never wired by a component. Reported identically on develop.
				'src/lib/query/tenant-posts.ts': ['exports'],
				// staff-profile-users.ts — `BulkUnassignStaffProfileUsersInput` is
				// only ever fed as a generic argument to
				// `bulkUnassignStaffProfileUsersMutationOptions`; knip cannot trace
				// the type through the build*() generic, so it reports the export
				// unused. Reported identically on develop.
				'src/lib/query/staff-profile-users.ts': ['types'],
				// Pre-existing develop export knip gaps surfaced by the #1554 merge
				// only because it mechanically updated these route files' imports
				// (EntityAvatar→PersonAvatar, @org/shared-ts→~/lib
				// should-logout-for-failure). Each scoped to the exact file + issue
				// type; any newly-added gap in these files still fails knip loudly.
				// Reported identically on origin/develop.
				'src/routes/authed/staff/tenants.tsx': ['exports'],
				'src/routes/authed/staff/audit-logs/$logId.tsx': ['exports'],
				'src/routes/authed/staff/tenant-users/$userId-organizations.tsx': [
					'exports',
				],
				// staff-tenant-activity.ts — #1570 (tenant activity tab) introduced
				// this file. Its exports (STAFF_TENANT_ACTIVITY_QUERY_KEY,
				// buildTenantActivityQueryParameters, tenantActivityQueryOptions)
				// are NOT dead code: they are self-consumed internally within the
				// same file — tenantActivityQueryOptions builds its queryKeyFn from
				// STAFF_TENANT_ACTIVITY_QUERY_KEY and feeds buildTenantActivityQueryParameters
				// into queryParameters, and useTenantActivityQuery wraps
				// tenantActivityQueryOptions (see the internal .queryKey/.fetcher
				// calls). knip reports these as unused exports because it does not
				// trace the chain across the buildStaffQueryOptions()/useQuery() generic
				// boundary, so this is a self-consumption false positive, not a
				// delete-when-cleanup tolerance. Scoped to the exact file + the exports
				// issue type so any newly-added export gap in this file still fails
				// knip loudly. Reported identically on origin/develop.
				'src/lib/query/staff-tenant-activity.ts': ['exports'],
			},
		},
		// Kiota-generated client: this directory IS the public API boundary —
		// the package exports map publishes every src/*.ts as
		// `@org/client-ts/<path>`, and consumers import models/endpoints
		// directly. Making all of src an entry set keeps its exports out of the
		// unused report while still tracking its runtime dependencies
		// (@microsoft/kiota-abstractions + the serialization packages imported
		// by the generated apiClient.ts serializer registration).
		'packages/client-ts': {
			entry: ['src/**/*.ts'],
		},
		'packages/scripts-ts': {
			entry: [
				// Every script here is a CLI run as
				// `node packages/scripts-ts/src/<name>.ts` (justfile recipes,
				// workflow steps, runbooks) — no manifest bin field exists for
				// knip to discover them from.
				'src/*.ts',
			],
			project: ['src/**/*.ts'],
			// review-front.ts launches the dev server through
			// `pnpm exec vite` in apps/front (vite is front's own dependency);
			// this package intentionally does not re-declare it.
			ignoreBinaries: ['vite'],
		},
	},
};

export default config;
