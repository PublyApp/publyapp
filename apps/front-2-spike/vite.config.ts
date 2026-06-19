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
