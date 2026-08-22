import type { KnipConfig } from 'knip';

const config: KnipConfig = {
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
