import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { reactRouter } from '@react-router/dev/vite';
import dotenv from 'dotenv';
import dotenvExpand from 'dotenv-expand';
import { reactRouterDevTools } from 'react-router-devtools';
import { defineConfig } from 'vite';
import checker from 'vite-plugin-checker';
import devtoolsJson from 'vite-plugin-devtools-json';

import copyI18nFiles from './_vite/copy-i18n-files';
import generateClient from './_vite/generate-client';
import { optimizeDepsIncludes } from './_vite/optimize-deps';

const frontSrcDir = fileURLToPath(new URL('./src', import.meta.url));
const frontRootDir = fileURLToPath(new URL('.', import.meta.url));
const workspaceRootDir = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig(({ mode, isSsrBuild }) => {
	const envFileName = `.env.${mode}`;
	const envConfig = dotenv.config({
		path: path.resolve(process.cwd(), '../../', envFileName),
		override: true,
	});
	dotenvExpand.expand(envConfig);

	return {
		plugins: [
			copyI18nFiles(),
			generateClient(),
			devtoolsJson(),
			checker({
				enableBuild: false,
				root: workspaceRootDir,
				typescript: {
					root: frontRootDir,
					tsconfigPath: 'tsconfig.json',
				},
				oxlint: {
					lintCommand: 'oxlint --quiet',
					watchPath: [
						'.oxlintrc.json',
						'apps/old-front',
						'packages/shared-ts',
						'scripts',
					],
				},
			}),
			reactRouterDevTools({
				tanstackViteConfig: {
					injectSource: {
						enabled: true,
						ignore: {
							components: ['PortalWrapper'],
						},
					},
				},
			}),
			reactRouter(),
		],
		resolve: {
			alias: {
				'#app': frontSrcDir,
			},
		},
		server: {
			port: 5050,
			watch: {
				ignored: ['**/packages/shared-ts/lib/i18n/json/**'],
			},
		},
		build: {
			target: 'es2022',
			rollupOptions: isSsrBuild ? { input: './server/app.ts' } : undefined,
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
		optimizeDeps: {
			include: optimizeDepsIncludes,
		},
	};
});
