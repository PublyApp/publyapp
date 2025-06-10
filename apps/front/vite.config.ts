import { reactRouter } from '@react-router/dev/vite';
import { defineConfig } from 'vite';
import checker from 'vite-plugin-checker';
import tsconfigPaths from 'vite-tsconfig-paths';
import { reactRouterDevTools } from 'react-router-devtools';
import devtoolsJson from 'vite-plugin-devtools-json';
import dotenv from 'dotenv';
import dotenvExpand from 'dotenv-expand';
import path from 'node:path';

export default defineConfig(({ mode }) => {
	const envFileName = `.env.${mode}`;
	const envConfig = dotenv.config({
		path: path.resolve(process.cwd(), envFileName),
		override: true,
	});
	dotenvExpand.expand(envConfig);

	return {
		plugins: [
			devtoolsJson(),
			reactRouterDevTools(),
			reactRouter(),
			tsconfigPaths(),
			checker({ typescript: true }),
		],
		server: {
			port: 6181,
		},
		build: {
			target: 'ES2022',
		},
		optimizeDeps: {
			esbuildOptions: {
				target: 'ES2022',
			},
		},
		ssr: {
			noExternal:
				// process.env.NODE_ENV === 'production'
				mode === 'production'
					? [
							'@mui/system',
							'@mui/material',
							'@mui/x-date-pickers',
							'@mui/utils',
							'@mui/x-data-grid',
							'@mui/x-tree-view',
							'@mui/x-internals',
							'@mui/styled-engine',
							'@mui/icons-material',
							// ====
							'mui-one-time-password-input',
							'@tiptap/extension-code-block-lowlight',
						]
					: [
							'mui-one-time-password-input',
							'@tiptap/extension-code-block-lowlight',
						],
		},
		resolve:
			// https://github.com/remix-run/react-router/issues/12568#issuecomment-2629986004
			// process.env.NODE_ENV === 'development'
			mode === 'development'
				? {}
				: {
						alias: {
							'react-dom/server': 'react-dom/server.node',
						},
					},
		// define: {
		// 	'process.env.VITE_SERVER_URL': JSON.stringify(/* your value */),
		// }
	};
});
