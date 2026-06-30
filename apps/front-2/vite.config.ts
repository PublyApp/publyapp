import { fileURLToPath } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
	server: {
		port: 3000,
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
		tailwindcss(),
		tanstackStart({
			srcDirectory: 'src',
			router: {
				virtualRouteConfig: './src/routes.ts',
			},
		}),
		viteReact(),
	],
});
