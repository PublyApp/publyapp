import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

// W6-FLAKE #827: the two tree-walking design-guard suites re-parse the whole
// src tree on every assertion round. Running them CONCURRENTLY with the
// render-heavy route fixtures starved render workers past testing-library's
// findBy* budget under load (the profiles bulk-delete flake), so this lane is
// run SEPARATELY, after the main app lane finishes — see the `test` script in
// package.json and vitest.config.ts (which excludes exactly these files).
//
// The include list is pinned to exactly these files: a broader glob here
// would drag other suites (including the Chromium-launching drawer contrast
// guard, which this lane must stay free of) into it. A `projects` split was
// rejected for THIS purpose because vite's config merge CONCATENATES per-
// project include/exclude arrays with the inherited root arrays, so both
// projects collected the full suite; two sequential lanes give strict
// after-renders ordering with no merge semantics involved.
//
// route-loader-query-key-guard.test.ts is the third tree-walking suite
// (#1552): it parses every route module under src/routes/ plus the lib/query
// hooks a route's own components call, so it belongs in the same
// after-renders lane.
const DESIGN_GUARD_TEST_FILES = [
	'src/lib/i18n-key-coverage.test.ts',
	'src/lib/mutation-feedback-architecture.test.ts',
	'src/lib/route-loader-query-key-guard.test.ts',
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
		include: DESIGN_GUARD_TEST_FILES,
		exclude: [],
		setupFiles: ['./vitest.setup.ts'],
		testTimeout: 30000,
	},
});
