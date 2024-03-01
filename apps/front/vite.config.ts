/* eslint-disable import/no-extraneous-dependencies */
// import path from 'path';

import { vitePlugin as remix } from '@remix-run/dev';
import { remixDevTools } from 'remix-development-tools/vite';
import { defineConfig } from 'vite';
import { cjsInterop } from 'vite-plugin-cjs-interop';
import tsconfigPaths from 'vite-tsconfig-paths';

// import commonjs from 'vite-plugin-commonjs';
// import { nodePolyfills } from 'vite-plugin-node-polyfills';

export default defineConfig({
	plugins: [
		remixDevTools(),
		remix(),
		// {
		// ignoredRouteFiles: ['**/.*'],
		// serverModuleFormat: 'esm',
		// }
		tsconfigPaths(),
		// nodePolyfills(),
		cjsInterop({
			dependencies: [
				'react-lazy-load-image-component',
				// -- Parse --
				// 'parse',
				// 'parse/node',
			],
		}),
		// commonjs({
		// 	// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
		// 	filter(id) {
		// 		// `node_modules` is exclude by default, so we need to include it explicitly
		// 		// https://github.com/vite-plugin/vite-plugin-commonjs/blob/v0.7.0/src/index.ts#L125-L127
		// 		if (id.includes('node_modules/parse')) {
		// 			return true;
		// 		}

		// 		return false;
		// 	},
		// }),
	],
	server: {
		port: 6181,
	},
	// build: {
	// 	sourcemap: true,
	// 	commonjsOptions: {
	// 		transformMixedEsModules: true,
	// 		// defaultIsModuleExports: true,
	// 	},
	// },
	// resolve: {
	// 	alias: {
	// 		'parse/node': path.resolve(__dirname, './node_modules/parse/parse.min.js'),
	// 		parse: path.resolve(__dirname, './node_modules/parse/dist/parse.min.js'),
	// 	},
	// },
	// ssr: {
	// 	external: ['parse', 'parse/node'],
	// },
});
