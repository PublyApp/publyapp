import { defineConfig, devices } from '@playwright/test';

import { STAFF_ADMIN_STORAGE_STATE } from './e2e/helpers/storage-state';

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
	projects: [
		{
			// Logs in once as staff-admin and saves the session so `chromium`/
			// `chromium-hermetic-counter` can start already authenticated instead
			// of every test paying for a full form login (review-r1-tests.md
			// F29). `loginAsStaffAdmin` itself is storageState-aware (see
			// e2e/helpers/login.ts) so it still works correctly for projects that
			// DON'T supply this state (chromium-faults) or if the captured
			// session has expired mid-run — it just falls back to a real login.
			name: 'setup',
			testMatch: authSetupSpecs,
		},
		{
			name: 'chromium',
			testIgnore: [
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
		},
		{
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
		},
		{
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
		},
		{
			// deploy/request-counter's sidecar counts traffic from EVERY worker
			// and browser globally (no per-test bucketing), so a spec asserting
			// an exact request count can only be hermetic if nothing else hits
			// the same path concurrently. `dependencies` makes Playwright run
			// the other two projects to completion FIRST, so by the time this
			// project starts there is no other in-flight traffic left to
			// pollute the count — see review-r1-tests.md F11 and
			// e2e/request-counter.spec.ts. Tradeoff: if a test in either
			// dependency project fails, Playwright skips this project's tests
			// entirely rather than running them — accepted here in exchange for
			// a real (not probabilistic) isolation guarantee. The CI workflow
			// shards the other projects across isolated stacks, then runs this
			// project alone with `--no-deps` after an explicit setup invocation.
			name: 'chromium-hermetic-counter',
			testIgnore: helperSpecs,
			testMatch: hermeticCounterSpecs,
			workers: 1,
			dependencies: ['setup', 'chromium', 'chromium-faults'],
			use: {
				...devices['Desktop Chrome'],
				storageState: STAFF_ADMIN_STORAGE_STATE,
			},
		},
	],
});
