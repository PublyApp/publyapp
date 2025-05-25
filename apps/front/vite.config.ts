import { reactRouter } from '@react-router/dev/vite';
import { defineConfig } from 'vite';
import checker from 'vite-plugin-checker';
import tsconfigPaths from 'vite-tsconfig-paths';
import { reactRouterDevTools } from 'react-router-devtools';
import devtoolsJson from 'vite-plugin-devtools-json';

export default defineConfig({
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
			process.env.NODE_ENV === 'production'
				? [
						'@mui/system',
						'@mui/material',
						'@mui/x-date-pickers',
						'@mui/utils',
						'@mui/x-data-grid',
						'@mui/x-tree-view',
						'@mui/x-internals',
						'@mui/styled-engine',
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
		process.env.NODE_ENV === 'development'
			? {}
			: {
					alias: {
						'react-dom/server': 'react-dom/server.node',
					},
				},
});
