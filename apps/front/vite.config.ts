import { reactRouter } from '@react-router/dev/vite';
import dotenv from 'dotenv';
import dotenvExpand from 'dotenv-expand';
import path from 'node:path';
import { reactRouterDevTools } from 'react-router-devtools';
import { defineConfig } from 'vite';
import checker from 'vite-plugin-checker';
import devtoolsJson from 'vite-plugin-devtools-json';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig(({ mode }) => {
	const envFileName = `.env.${mode}`;
	const envConfig = dotenv.config({
		path: path.resolve(process.cwd(), envFileName),
		override: true,
	});
	dotenvExpand.expand(envConfig);

	const isDevelopment = mode === 'development';

	return {
		plugins: [
			devtoolsJson(),
			reactRouterDevTools(),
			reactRouter(),
			tsconfigPaths(),
			checker({ typescript: true }),
		],
		server: {
			port: 6181,
			headers: isDevelopment
				? {
						// Emulate the same CSP policy as your backend server
						'Content-Security-Policy': [
							"default-src 'self'",
							"script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.pdfvite.com",
							"style-src 'self' 'unsafe-inline'",
							"img-src 'self' data: blob: https:",
							"font-src 'self' data:",
							"connect-src 'self' https://www.pdfvite.com ws: wss:",
							"media-src 'self'",
							"object-src 'none'",
							"base-uri 'self'",
							"form-action 'self'",
							"frame-ancestors 'none'",
							'upgrade-insecure-requests',
						].join('; '),
						// Add report-only mode for development (same as backend)
						'Content-Security-Policy-Report-Only': [
							"default-src 'self'",
							"script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.pdfvite.com",
							"style-src 'self' 'unsafe-inline'",
							"img-src 'self' data: blob: https:",
							"font-src 'self' data:",
							"connect-src 'self' https://www.pdfvite.com ws: wss:",
							"media-src 'self'",
							"object-src 'none'",
							"base-uri 'self'",
							"form-action 'self'",
							"frame-ancestors 'none'",
							'upgrade-insecure-requests',
						].join('; '),
					}
				: {},
		},
		build: {
			target: 'ES2022',
		},
		optimizeDeps: {
			esbuildOptions: {
				target: 'ES2022',
			},
			include: ['@org/shared/lib/csp'],
		},
		ssr: {
			noExternal:
				// process.env.NODE_ENV === 'production'
				mode === 'production'
					? [
							'@mui/system',
							'@mui/material',
							'@mui/utils',
							'@mui/icons-material',
							'@mui/styled-engine',
							// ====
							'@mui/x-date-pickers',
							'@mui/x-data-grid',
							'@mui/x-tree-view',
							'@mui/x-internals',
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
			// process.env.NODE_ENV === 'development'
			mode === 'development'
				? {}
				: {
						alias: {
							'react-dom/server': 'react-dom/server.node',
						},
					},
		// define: {
		// 	'process.env.VITE_SERVER_URL': JSON.stringify(/* your value */),
		// }
	};
});
