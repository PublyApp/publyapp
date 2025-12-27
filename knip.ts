import type { KnipConfig } from 'knip';

const config: KnipConfig = {
	workspaces: {
		'.': {
			entry: 'scripts/*.mjs',
			project: 'scripts/**/*.mjs',
		},
		'apps/front': {
			entry: [
				'server.js',
				'server/app.ts',
				'app/entry.server.tsx',
				'app/entry.client.tsx',
				'app/root.tsx',
				'app/routes.ts',
			],
			project: [
				'app/**/*.{tsx,ts,mjs,js,cjs,json}',
				'server/**/*.{ts,mjs,js,cjs,json}',
			],
		},
		'apps/front2': {
			entry: [
				'server.js',
				'server/app.ts',
				'server/dev.js',
				'app/entry.server.tsx',
				'app/entry.client.tsx',
				'app/root.tsx',
				'app/routes.ts',
			],
			project: [
				'app/**/*.{tsx,ts,mjs,js,cjs,json}',
				'server/**/*.{ts,mjs,js,cjs,json}',
			],
		},
		'apps/api': {
			entry: 'run-dev.mjs',
		},
	},
};

export default config;
