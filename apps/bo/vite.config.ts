/* eslint-disable import/no-extraneous-dependencies */
import * as path from 'path';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import svgr from 'vite-plugin-svgr';
import tsconfigPaths from 'vite-tsconfig-paths';

// https://vitejs.dev/config/
export default defineConfig({
	resolve: {
		alias: [
			// {
			// 	find: '@',
			// 	replacement: path.resolve(__dirname, 'src'),
			// },
			{
				find: 'parse',
				replacement: path.resolve(__dirname, './node_modules/parse/dist/parse.min.js'),
			},
		],
		// alias: {
		// 	parse: path.resolve(__dirname, './node_modules/parse/dist/parse.min.js'),
		// },
	},
	plugins: [
		react({
			jsxImportSource: '@emotion/react',
			babel: {
				plugins: ['@emotion/babel-plugin'],
			},
		}),
		tsconfigPaths(),
		svgr(),
	],
});
