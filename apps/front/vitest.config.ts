import { cpus } from 'node:os';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

// Defaulting to one worker per core oversubscribes the host the moment
// anything else (another vitest run, a dev server, CI's own scheduler
// overhead) is competing for the same cores — the exact condition that
// starved a worker long enough to blow past even a generous per-test
// timeout budget (see W6-FLAKE). Capping to half the cores leaves real
// headroom instead of assuming this process owns the whole machine.
const maxWorkers = Math.max(2, Math.floor(cpus().length / 2));

// W6-FLAKE #827: the two tree-walking design-guard suites re-parse the whole
// src tree on every assertion round. Running them CONCURRENTLY with the
// render-heavy route fixtures starved render workers past testing-library's
// findBy* budget under load (the profiles bulk-delete flake). They are
// EXCLUDED here and run afterwards by vitest.design-guards.config.ts — see
// the `test` script in package.json. A `projects` split with sequence
// groupOrder was rejected because vite's config merge CONCATENATES per-
// project include/exclude arrays with the inherited root arrays, so both
// projects still collected the full suite; two sequential lanes give strict
// after-renders ordering with no merge semantics involved.
const DESIGN_GUARD_TEST_FILES = [
	'src/lib/i18n-key-coverage.test.ts',
	'src/lib/mutation-feedback-architecture.test.ts',
];

export default defineConfig({
	resolve: {
		alias: {
			'~': fileURLToPath(new URL('./src', import.meta.url)),
		},
	},
	ssr: {
		// Keep in sync with ssr.noExternal in vite.config.ts (same bundling
		// policy and rationale).
		noExternal: [
			'@org/client-ts',
			'@org/shared-ts',
			/@microsoft\/kiota-serialization-(json|form|multipart|text)/,
			/^lodash\//,
			'winston',
			'winston-console-format',
		],
	},
	test: {
		environment: 'node',
		server: {
			deps: {
				inline: ['@org/client-ts', '@org/shared-ts'],
			},
		},
		include: [
			'src/**/*.{test.ts,test.tsx}',
			'e2e/helpers/**/*.test.ts',
			'e2e/__tests__/**/*.test.ts',
		],
		// Round 19 I3: the drawer-description contrast guard is the ONLY
		// browser-launching test in the suite. It now runs in the e2e lane
		// (which already provisions Chromium) via vitest.drawer.config.ts, so
		// the ordinary `pnpm --filter front test` stays browser-free and no
		// unit-lane contributor or CI run needs to install a browser for a
		// synthetic guard the live e2e already bounds — see
		// vitest.drawer.config.ts.
		//
		// tests/proofs/ holds EXPECTED-TO-FAIL red proof tests (issue #1659).
		// They must never run in the green suite — a leaked red proof would
		// make the suite permanently red. They are replayed by
		// vitest.preuves.config.ts + run-preuves.mts instead.
		exclude: [
			'tests/proofs/**',
			'src/styles/drawer-description-contrast.test.ts',
			// The e2e tag guard is pure static analysis (reads .spec.ts files);
			// it runs in the vitest lane but belongs under e2e/ for proximity.
			...DESIGN_GUARD_TEST_FILES,
		],
		setupFiles: ['./vitest.setup.ts'],
		// The default 5000ms per-test budget, combined with testing-library's
		// default 1000ms waitFor/findBy* timeout, is tight enough to flake under
		// vitest's own file-level parallelism (many worker processes contending
		// for the host's CPU) — see W6-FLAKE. A slow/hung test still fails, just
		// with headroom for a still-resolving re-render under load.
		testTimeout: 30000,
		maxWorkers,
	},
});
