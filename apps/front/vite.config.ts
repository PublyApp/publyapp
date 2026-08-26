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
			noExternal: [
				// The workspace packages are bundled (not externalized) so their
				// transitive imports are visible to Vite at bundle time. Those
				// packages import bare specifiers that are only resolvable from
				// a full install: `lodash/*` and `winston`/`winston-console-format`
				// come from shared-ts, and client-ts registers the Kiota
				// serialization factories (`@microsoft/kiota-serialization-*`)
				// at runtime. The production image ships `pnpm deploy --prod`,
				// where devDependencies do not exist and pnpm does not hoist
				// transitive deps to the top level, so an externalized bare
				// specifier fails to resolve on the first request inside the
				// container. Inlining them here keeps every server chunk
				// self-contained.
				'@org/client-ts',
				'@org/shared-ts',
				/@microsoft\/kiota-serialization-(json|form|multipart|text)/,
				/^lodash\//,
				'winston',
				'winston-console-format',
			],
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
