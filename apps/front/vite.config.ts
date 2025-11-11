import path from 'node:path';
import { reactRouter } from '@react-router/dev/vite';
import dotenv from 'dotenv';
import dotenvExpand from 'dotenv-expand';
import { reactRouterDevTools } from 'react-router-devtools';
import { defineConfig } from 'vite';
import checker from 'vite-plugin-checker';
import devtoolsJson from 'vite-plugin-devtools-json';
import tsconfigPaths from 'vite-tsconfig-paths';
import copyI18nFiles from './_vite/copy-i18n-files';
import generateClient from './_vite/generate-client';

export default defineConfig(({ mode, isSsrBuild }) => {
	const envFileName = `.env.${mode}`;
	const envConfig = dotenv.config({
		path: path.resolve(process.cwd(), '../../', envFileName),
		override: true,
	});
	dotenvExpand.expand(envConfig);

	return {
		plugins: [
			copyI18nFiles(),
			generateClient(),
			devtoolsJson(),
			tsconfigPaths(),
			checker({
				// typescript: true,
				// biome: true,
			}),
			reactRouterDevTools(),
			reactRouter(),
		],
		server: {
			port: 5050,
			watch: {
				ignored: ['**/packages/shared/lib/i18n/json/**'],
			},
		},
		build: {
			target: 'ES2022',
			rollupOptions: isSsrBuild ? { input: './server/app.ts' } : undefined,
		},
		optimizeDeps: {
			esbuildOptions: {
				target: 'ES2022',
			},
			include: [
				'lodash',
				'nprogress',
				'cookie',
				'isbot',
				'serialize-error',
				// ====
				'@mui/system',
				'@mui/material',
				'@mui/utils',
				'@mui/icons-material',
				'@mui/styled-engine',
				// ====
				'@mui/x-date-pickers',
				'@mui/x-data-grid',
				'@mui/x-tree-view',
				// ====
				'mui-one-time-password-input',
				'@tiptap/extension-code-block-lowlight',
			],
		},
		ssr: {
			noExternal:
				// process.env.NODE_ENV === 'production'
				mode === 'production'
					? [
							'@mui/system',
							'@mui/material',
							'@mui/utils',
							'@mui/icons-material',
							'@mui/styled-engine',
							// ====
							'@mui/x-date-pickers',
							'@mui/x-data-grid',
							'@mui/x-tree-view',
							'@mui/x-internals',
							// ====
							'mui-one-time-password-input',
							'@tiptap/extension-code-block-lowlight',
						]
					: [
							'mui-one-time-password-input',
							'@tiptap/extension-code-block-lowlight',
						],
		},
	};
});
