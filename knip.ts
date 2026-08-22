import type { KnipConfig } from 'knip';

const config: KnipConfig = {
	workspaces: {
		'.': {
			entry: 'scripts/*.mjs',
			project: 'scripts/**/*.mjs',
		},
		'apps/api': {
			entry: 'run-dev.mjs',
		},
	},
};

export default config;
