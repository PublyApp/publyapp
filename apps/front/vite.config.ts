import { fileURLToPath } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

import { contextChunkIsolationPlugin } from './tools/vite/check-context-chunk-isolation.mts';
import { contextChunkIsolationInventory } from './tools/vite/context-chunk-isolation.inventory.mts';

const workspaceRootDir = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig(({ mode }) => {
	const rootEnv = loadEnv(mode, workspaceRootDir, '');
	process.env.PUBLIC_API_BASE_URL ??=
		rootEnv.PUBLIC_API_BASE_URL ?? rootEnv.VITE_ASP_SERVER_URL;
	process.env.SERVER_API_BASE_URL ??=
		rootEnv.SERVER_API_BASE_URL ??
		rootEnv.PUBLIC_API_BASE_URL ??
		rootEnv.VITE_ASP_SERVER_URL;
	process.env.PUBLIC_POSTHOG_PROJECT_TOKEN ??=
		rootEnv.PUBLIC_POSTHOG_PROJECT_TOKEN ?? rootEnv.POSTHOG_PROJECT_TOKEN;

	return {
		envDir: workspaceRootDir,
		server: {
			port: 5050,
		},
		resolve: {
			alias: {
				'~': fileURLToPath(new URL('./src', import.meta.url)),
			},
		},
		ssr: {
			noExternal: ['@org/client-ts', '@org/shared-ts'],
		},
		plugins: [
			contextChunkIsolationPlugin({
				contextInventory: contextChunkIsolationInventory,
				tsconfigPath: fileURLToPath(
					new URL('./tsconfig.json', import.meta.url),
				),
				workspaceDirectory: workspaceRootDir,
			}),
			tailwindcss(),
			tanstackStart({
				srcDirectory: 'src',
				router: {
					virtualRouteConfig: './src/routes.ts',
				},
			}),
			viteReact({ compiler: true }),
		],
	};
});
