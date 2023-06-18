/* eslint-disable import/no-extraneous-dependencies */
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';
import svgr from 'vite-plugin-svgr';
// import * as path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
	// resolve: {
	//   alias: [{ find: '@', replacement: path.resolve(__dirname, 'src') }],
	// },
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
