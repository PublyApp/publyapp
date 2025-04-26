import { reactRouter } from '@react-router/dev/vite';
import { defineConfig } from 'vite';
import checker from 'vite-plugin-checker';
import tsconfigPaths from 'vite-tsconfig-paths';
import { reactRouterDevTools } from 'react-router-devtools';

export default defineConfig({
	plugins: [
		reactRouterDevTools(),
		reactRouter(),
		tsconfigPaths(),
		checker({ typescript: true }),
	],
	server: {
		port: 6181,
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
});
