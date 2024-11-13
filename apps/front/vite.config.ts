/* eslint-disable import/no-extraneous-dependencies */
import { vitePlugin as remix } from '@remix-run/dev';
import { defineConfig } from 'vite';
import { cjsInterop } from 'vite-plugin-cjs-interop';
import tsconfigPaths from 'vite-tsconfig-paths';

import { routes } from './remix-config';

export default defineConfig({
	plugins: [
		remix({
			routes,
		}),
		tsconfigPaths(),
		cjsInterop({
			dependencies: [
				'react-lazy-load-image-component',
				// dev: success; build: success; remix-serve: failed
				// https://github.com/remix-run/remix/issues/8828#issuecomment-1977945095
				...(process.env.NODE_ENV === 'development' ? ['@mui/material/*'] : []),
				// -- Parse -- // ! we no longer use the Parse SDK
				// 'parse',
				// 'parse/node',
			],
		}),
	],
	server: {
		port: 6181,
	},
	ssr: {
		noExternal: [
			// https://github.com/remix-run/remix/issues/8828#issuecomment-1977945095
			...(process.env.NODE_ENV === 'production' ? [/^@mui\//] : []), // or  `['@mui/**']`
		],
	},
});
