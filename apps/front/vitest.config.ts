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

export default defineConfig({
	resolve: {
		alias: {
			'~': fileURLToPath(new URL('./src', import.meta.url)),
		},
	},
	ssr: {
		noExternal: ['@org/client-ts', '@org/shared-ts'],
	},
	test: {
		environment: 'node',
		server: {
			deps: {
				inline: ['@org/client-ts', '@org/shared-ts'],
			},
		},
		include: ['src/**/*.{test.ts,test.tsx}', 'e2e/helpers/**/*.test.ts'],
		// Round 19 I3: the drawer-description contrast guard is the ONLY
		// browser-launching test in the suite. It now runs in the e2e lane
		// (which already provisions Chromium) via vitest.drawer.config.ts, so
		// the ordinary `pnpm --filter front test` stays browser-free and no
		// unit-lane contributor or CI run needs to install a browser for a
		// synthetic guard the live e2e already bounds — see
		// vitest.drawer.config.ts.
		exclude: ['src/styles/drawer-description-contrast.test.ts'],
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
