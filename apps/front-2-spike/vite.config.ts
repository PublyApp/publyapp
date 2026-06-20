import tailwindcss from '@tailwindcss/vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
	server: {
		port: 3000,
	},
	resolve: {
		tsconfigPaths: true,
	},
	// Workspace TS deps ship raw .ts (no build step). Vite must transpile them for
	// SSR instead of trying to `require`/import them externally as ESM .ts (which
	// throws ERR_UNKNOWN_FILE_EXTENSION at runtime). Matches the current `front`.
	ssr: {
		noExternal: ['@org/client-ts', '@org/shared-ts'],
	},
	plugins: [
		tailwindcss(),
		// Task 1.4 — Virtual File Routes (code-based tree in src/routes.ts).
		// Primary attempt: nest virtualRouteConfig under tanstackStart's router opts.
		tanstackStart({
			srcDirectory: 'src',
			router: { virtualRouteConfig: './src/routes.ts' },
		}),
		viteReact(),
	],
});
