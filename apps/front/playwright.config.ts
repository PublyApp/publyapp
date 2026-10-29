import { defineConfig, devices, type Project } from '@playwright/test';

import { STAFF_ADMIN_STORAGE_STATE } from './e2e/helpers/storage-state';
import { SMOKE_SPEC_PATTERNS } from './e2e/smoke-specs';

const faultSpecs = ['**/auth-error.spec.ts', '**/log-leak.spec.ts'];
const hermeticCounterSpecs = ['**/request-counter.spec.ts'];
const authSetupSpecs = ['**/auth.setup.ts'];
const helperSpecs = ['**/helpers/**', '**/__tests__/**'];
// #973 review round 3: this spec renders a real, app-independent
// `page.setContent()` page — the REAL compiled production CSS
// (`dist/client/assets/*.css`, built once per process) plus markup
// mirroring the real app-shell/breadcrumb components' rendered classes — to
// get a genuine Chromium `getComputedStyle()`/`scrollWidth`/`clientWidth`
// reading without a live login, backend, or docker-compose stack. Same
// pattern as `feat/ui-profile-batch`'s `chromium-hermetic-source` project
// (#992 review round 2) — kept as one convention rather than two. Must not
// depend on `setup` and must not also run under `chromium`.
const hermeticSourceSpecs = [
	'**/breadcrumb-entity-name-truncation.spec.ts',
	// #823: the rendered focus-ring cascade proof (real primitives, real
	// compiled CSS, real keyboard focus) — same hermetic constraints.
	'**/focus-ring-cascade.spec.ts',
	// #1799: the icon visibility guard's real-browser proof. Real
	// `DataTable` markup rendered through Vite SSR, real compiled
	// production CSS, real `getComputedStyle`. The vitest proof at
	// `tests/proofs/1799/` exercises the helper's measurement contract
	// through a fake reader; this spec exercises the same helper through
	// the browser's own reader, so a fake-reader regression cannot
	// re-open the defect here.
	'**/data-table-icon-visibility-guard.spec.ts',
];
const isCiShard = process.env.PLAYWRIGHT_CI_SHARD === 'true';

/**
 * Which slice of the suite this process runs (audit
 * `docs/records/2026-10-29-analysis-e2e-suite-audit.md`, issue #2260).
 *
 * - `all` (default, and what an unconfigured local run gets): every spec, as
 *   before the split. Nothing is silently dropped from a contributor's run.
 * - `smoke`: only `SMOKE_SPEC_PATTERNS` — the twelve specs every pull request
 *   runs, on ONE stack, targeted at ≤ 3 minutes.
 * - `full`: everything EXCEPT the smoke list — derived, never re-listed, so
 *   `smoke ∪ full` is the whole suite and `smoke ∩ full` is empty BY
 *   CONSTRUCTION. That is the partition proof: adding a spec to the tree puts
 *   it in `full` automatically (nothing can be lost), and adding it to the
 *   smoke list moves it out of `full` in the same commit.
 *
 * This is one explicit file list plus the existing config — no second tag
 * vocabulary, no new Playwright project, no grep (`F5`: six tests live outside
 * any tagged `describe`, so a grep split would drop them from both lanes).
 */
export type E2eLane = 'all' | 'smoke' | 'full';

const parseLane = (raw: string | undefined): E2eLane => {
	if (raw === undefined || raw === '') {
		return 'all';
	}
	if (raw === 'all' || raw === 'smoke' || raw === 'full') {
		return raw;
	}
	throw new Error(
		`E2E_LANE must be "all", "smoke" or "full", got ${JSON.stringify(raw)}`,
	);
};

export const E2E_LANE = parseLane(process.env.E2E_LANE);

const setupProject: Project = {
	// Logs in once as staff-admin and saves the session so `chromium`/
	// `chromium-hermetic-counter` can start already authenticated instead
	// of every test paying for a full form login (review-r1-tests.md
	// F29). `loginAsStaffAdmin` itself is storageState-aware (see
	// e2e/helpers/login.ts) so it still works correctly for projects that
	// DON'T supply this state (chromium-faults) or if the captured
	// session has expired mid-run — it just falls back to a real login.
	name: 'setup',
	testMatch: authSetupSpecs,
};

const smokeProject: Project = {
	name: 'chromium',
	testMatch: [...SMOKE_SPEC_PATTERNS],
	dependencies: ['setup'],
	use: {
		...devices['Desktop Chrome'],
		storageState: STAFF_ADMIN_STORAGE_STATE,
	},
};

const chromiumProject: Project = {
	name: 'chromium',
	testIgnore: [
		// `full` excludes the smoke list; `all` runs it too.
		...(E2E_LANE === 'full' ? SMOKE_SPEC_PATTERNS : []),
		...faultSpecs,
		...hermeticCounterSpecs,
		...authSetupSpecs,
		...hermeticSourceSpecs,
		...helperSpecs,
	],
	dependencies: ['setup'],
	use: {
		...devices['Desktop Chrome'],
		storageState: STAFF_ADMIN_STORAGE_STATE,
	},
};

const hermeticSourceProject: Project = {
	// No `dependencies`, no `storageState`, no navigation to `baseURL` —
	// these specs never log in or talk to a live stack, so they must be
	// able to run even when the docker-compose stack is down.
	name: 'chromium-hermetic-source',
	testIgnore: helperSpecs,
	testMatch: hermeticSourceSpecs,
	workers: 1,
	use: {
		...devices['Desktop Chrome'],
	},
};

const faultsProject: Project = {
	// Forges its own session cookies / tests the no-session and invalid-
	// session paths directly — must start from a clean context, so no
	// storageState and no dependency on `setup`.
	name: 'chromium-faults',
	testIgnore: helperSpecs,
	testMatch: faultSpecs,
	workers: 1,
	use: {
		...devices['Desktop Chrome'],
	},
};

const counterProject: Project = {
	// deploy/request-counter's sidecar counts traffic from every client on the
	// stack, so this project used to DEPEND on `chromium`/`chromium-faults`
	// finishing first — and Playwright skips a project whose dependency failed,
	// which made the doubled-request guard disappear on exactly the red runs it
	// exists for (#2260 F6).
	//
	// The spec is now hermetic by construction instead: it marks its own traffic
	// with a unique `?__e2e_counter=` parameter and reads only that bucket
	// (review-r1-tests.md F11, e2e/request-counter.spec.ts). No ordering
	// requirement, no dependency, and it can fail on its own terms.
	name: 'chromium-hermetic-counter',
	testIgnore: helperSpecs,
	testMatch: hermeticCounterSpecs,
	workers: 1,
	use: {
		...devices['Desktop Chrome'],
		storageState: STAFF_ADMIN_STORAGE_STATE,
	},
};

/** The smoke lane is ONE stack and only the twelve specs — the other projects
 * select none of them, so running them would only add empty report rows. */
const projects: Project[] =
	E2E_LANE === 'smoke'
		? [setupProject, smokeProject]
		: [
				setupProject,
				chromiumProject,
				hermeticSourceProject,
				faultsProject,
				counterProject,
			];

export default defineConfig({
	testDir: './e2e',
	testIgnore: helperSpecs,
	timeout: 30_000,
	expect: {
		timeout: 5_000,
	},
	// CI must never silently reduce a full run to a stray `.only` (there is
	// none in the tree today — see review-r1-tests.md F30 — but nothing
	// stopped one from landing without this).
	forbidOnly: !!process.env.CI,
	// Deliberately 0 (the Playwright default), not raised for CI: this
	// suite's highest-value tests exist specifically to catch races and
	// stampedes (cold-boot, tab-refocus, the 401/403 logout invariant,
	// request-counter isolation) — retries would mask exactly the flake
	// vectors those tests are written to surface instead of surfacing them.
	// See review-r1-tests.md F24.
	retries: 0,
	// One worker per stack keeps shared API/database state deterministic. CI
	// gets parallelism from four isolated stacks instead. `fullyParallel` is
	// enabled only there so Playwright can balance individual tests across
	// shards without introducing concurrency inside any one stack.
	workers: 1,
	fullyParallel: isCiShard,
	reporter: [
		['list'],
		['html', { outputFolder: 'playwright-report', open: 'never' }],
	],
	use: {
		// E2E_BASE_URL lets a private docker-compose instance (remapped host
		// ports) reuse this config; the default is the shared-stack URL.
		baseURL: process.env.E2E_BASE_URL ?? 'https://front.localhost:8443',
		headless: true,
		ignoreHTTPSErrors: true,
		trace: 'retain-on-failure',
	},
	projects,
});
