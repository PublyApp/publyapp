/* eslint-disable import/no-extraneous-dependencies */
import { pigment } from '@pigment-css/vite-plugin';
import { reactRouter } from '@react-router/dev/vite';
import { defineConfig } from 'vite';
import checker from 'vite-plugin-checker';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
	plugins: [pigment({}), reactRouter(), tsconfigPaths(), checker({ typescript: true })],
	server: {
		port: 6181,
	},
	ssr: {
		noExternal: [
			'@mui/system',
			'@mui/material',
			'@mui/x-date-pickers',
			'@mui/utils',
			'@mui/x-data-grid',
			'@mui/x-tree-view',
			'@mui/x-internals',
			'@mui/styled-engine',
		],
	},
});
