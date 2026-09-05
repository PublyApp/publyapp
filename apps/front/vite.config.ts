import { fileURLToPath } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

import { contextChunkIsolationPlugin } from './tools/vite/check-context-chunk-isolation.mts';
import { contextChunkIsolationInventory } from './tools/vite/context-chunk-isolation.inventory.mts';
import { transformSimplebarUpstreamCssPlugin } from './tools/vite/transform-simplebar-upstream-css.mts';

const workspaceRootDir = fileURLToPath(new URL('../..', import.meta.url));
const frontDirectory = fileURLToPath(new URL('.', import.meta.url));

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
				// a full install: `lodash/*` comes from shared-ts, and
				// client-ts registers the Kiota serialization factories
				// (`@microsoft/kiota-serialization-*`) at runtime. The
				// production image ships `pnpm deploy --prod`, where
				// devDependencies do not exist and pnpm does not hoist
				// transitive deps to the top level, so an externalized bare
				// specifier fails to resolve on the first request inside the
				// container. Inlining them here keeps every server chunk
				// self-contained.
				//
				// `winston` is deliberately NOT listed here: it is a CJS module
				// that Vite's SSR module runner cannot transform when forced
				// into the bundle (`require is not defined` at winston's entry).
				// It is pulled in transitively by `@org/shared-ts`
				// (`iso-logger` does `await import('winston')`), and because
				// `@org/shared-ts` itself is bundled above, winston is reached as
				// an *external* `require` at runtime — which resolves correctly
				// in dev, in the e2e Vite SSR runner, and in the deployed image
				// (winston ships as a transitive dependency of `@org/shared-ts`).
				// Listing `winston` here regresses the focus-ring-cascade e2e
				// spec, which renders the real ui primitives through this config.
				'@org/client-ts',
				'@org/shared-ts',
				/@microsoft\/kiota-serialization-(json|form|multipart|text)/,
				/^lodash\//,
			],
		},
		plugins: [
			transformSimplebarUpstreamCssPlugin({ frontDirectory }),
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
