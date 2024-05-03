/* eslint-disable import/no-extraneous-dependencies */

import { vitePlugin as remix } from '@remix-run/dev';
import { remixDevTools } from 'remix-development-tools/vite';
import { defineConfig } from 'vite';
import { cjsInterop } from 'vite-plugin-cjs-interop';
import tsconfigPaths from 'vite-tsconfig-paths';

import { routes } from './remix-config';

export default defineConfig({
	plugins: [
		remixDevTools(),
		remix({
			routes,
		}),
		tsconfigPaths(),
		cjsInterop({
			dependencies: [
				'react-lazy-load-image-component',
				// -- Parse -- // ! we no longer use the Parse SDK
				// 'parse',
				// 'parse/node',
			],
		}),
	],
	server: {
		port: 6181,
	},
});
