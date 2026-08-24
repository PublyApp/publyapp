import type { KnipConfig } from 'knip';

const config: KnipConfig = {
	// Vendored upstream plugin code (dmmulroy/anti-slop @ 6d53855) is outside
	// the house dependency graph — same policy as when it lived under tools/,
	// which knip never scanned. See packages/lint-ts/src/anti-slop/README.md.
	ignore: ['packages/lint-ts/src/anti-slop/**'],
	workspaces: {
		'.': {
			entry: 'packages/scripts-ts/src/*.ts',
			project: 'packages/scripts-ts/src/**/*.ts',
		},
		'apps/api': {
			entry: 'run-dev.mjs',
		},
	},
};

export default config;
