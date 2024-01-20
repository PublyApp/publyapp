/* eslint-disable import/no-extraneous-dependencies */
import { unstable_vitePlugin as remix } from '@remix-run/dev';
import { remixDevTools } from 'remix-development-tools/vite';
import { defineConfig } from 'vite';
import { cjsInterop } from 'vite-plugin-cjs-interop';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
	plugins: [
		remixDevTools(),
		remix(),
		// {
		// ignoredRouteFiles: ['**/.*'],
		// serverModuleFormat: 'esm',
		// }
		tsconfigPaths(),
		cjsInterop({
			dependencies: ['react-lazy-load-image-component'],
		}),
	],
	server: {
		port: 6181,
	},
});
