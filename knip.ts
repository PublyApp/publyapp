import type { KnipConfig } from 'knip';

const config: KnipConfig = {
	workspaces: {
		'.': {
			entry: 'scripts/*.mjs',
			project: 'scripts/**/*.mjs',
		},
		'apps/front': {
			entry: [
				'react-router.config.ts',
				'vite.config.ts',
				'server.js',
				'server/app.ts',
				'src/entry.server.tsx',
				'src/entry.client.tsx',
				'src/root.tsx',
				'src/routes.ts',
			],
			project: [
				'src/**/*.{tsx,ts,mjs,js,cjs,json}',
				'server/**/*.{ts,mjs,js,cjs,json}',
			],
		},
		'apps/api': {
			entry: 'run-dev.mjs',
		},
	},
};

export default config;
