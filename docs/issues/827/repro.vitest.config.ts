import { cpus } from 'node:os';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

// Chantier #827 repro-only vitest config. Reproduces the W6-FLAKE condition
// deterministically:
//  - maxWorkers ABOVE the core count (the pre-W6 oversubscription the issue
//    describes; the shipped config caps at half the cores),
//  - the two tree-walking guard files pinned to sequence group 1 so their
//    whole-tree parse bursts land AFTER the render fixtures start resolving
//    (the exact mid-render starvation window),
//  - default findBy* budget restored via vitest.repro-setup.ts,
//  - serial file execution (--no-file-parallelism equivalent) so a starved
//    render cannot recover on another worker's timeslice.
//
// NOT part of the shipped suite; used only by .dump/wt827/repro-827.sh.
// `root` is pinned to apps/front so the alias/setup/include paths resolve
// exactly as they do under the shipped config.

const FRONT_ROOT = fileURLToPath(new URL('../../apps/front', import.meta.url));

const REPRO_SETUP = fileURLToPath(
	new URL('./vitest.repro-setup.ts', import.meta.url),
);

const DESIGN_GUARD_TEST_FILES = [
	'src/lib/i18n-key-coverage.test.ts',
	'src/lib/mutation-feedback-architecture.test.ts',
];

export default defineConfig({
	root: FRONT_ROOT,
	resolve: {
		alias: {
			'~': fileURLToPath(new URL('../../apps/front/src', import.meta.url)),
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
		include: ['src/**/*.{test.ts,test.tsx}'],
		exclude: ['src/styles/drawer-description-contrast.test.ts'],
		setupFiles: ['./vitest.setup.ts', REPRO_SETUP],
		maxWorkers: Math.max(2, Math.floor(cpus().length * 2)),
		fileParallelism: false,
		projects: [
			{
				extends: true,
				test: {
					name: 'app',
					include: ['src/**/*.{test.ts,test.tsx}'],
					exclude: [...DESIGN_GUARD_TEST_FILES],
				},
			},
			{
				extends: true,
				test: {
					name: 'design-guards',
					include: DESIGN_GUARD_TEST_FILES,
					exclude: [],
					sequence: {
						groupOrder: 1,
					},
				},
			},
		],
	},
});
