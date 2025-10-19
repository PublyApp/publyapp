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
	},
};

export default config;
