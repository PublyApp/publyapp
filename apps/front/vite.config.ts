/* eslint-disable import/no-extraneous-dependencies */
import path from 'path';

import { unstable_vitePlugin as remix } from '@remix-run/dev';
import { remixDevTools } from 'remix-development-tools/vite';
import { defineConfig } from 'vite';
import { cjsInterop } from 'vite-plugin-cjs-interop';
import tsconfigPaths from 'vite-tsconfig-paths';

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
			dependencies: ['react-lazy-load-image-component'],
		}),
	],
	server: {
		port: 6181,
	},
	build: {
		sourcemap: true,
	},
	resolve: {
		alias: {
			'parse/node': path.resolve(__dirname, './node_modules/parse/parse.min.js'),
			parse: path.resolve(__dirname, './node_modules/parse/dist/parse.min.js'),
		},
	},
	ssr: {
		external: ['parse', 'parse/node'],
	},
});
