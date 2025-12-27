import path from 'node:path';

import { reactRouter } from '@react-router/dev/vite';
import { defineConfig, loadEnv } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig(({ mode }) => {
	const rootDir = path.resolve(__dirname, '../..');
	const env = loadEnv(mode, rootDir, '');

	process.env = { ...process.env, ...env };

	return {
		envDir: rootDir,
		server: {
			port: 5051,
			hmr: {
				port: 24679,
			},
			warmup: {
				clientFiles: ['./app/root.tsx', './app/routes/**/*.tsx'],
			},
		},
		build: {
			target: 'ES2022',
		},
		optimizeDeps: {
			esbuildOptions: {
				target: 'ES2022',
			},
			include: [
				'react',
				'react-dom',
				'react/jsx-runtime',
				'react/jsx-dev-runtime',
				'react-dom/client',
				'@emotion/react',
				'@emotion/styled',
				'@emotion/cache',
				'@mui/system',
				'@mui/material',
				'@mui/utils',
				'@mui/icons-material',
				'@mui/styled-engine',
			],
		},
		ssr: {
			noExternal:
				mode === 'production'
					? [
							'@mui/material',
							'@mui/icons-material',
							'@mui/system',
							'@emotion/react',
							'@emotion/styled',
						]
					: undefined,
		},
		plugins: [reactRouter(), tsconfigPaths({ root: rootDir })],
	};
});
