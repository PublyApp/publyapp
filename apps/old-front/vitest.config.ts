import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

export default defineConfig({
	resolve: {
		alias: {
			'#app': fileURLToPath(new URL('./src', import.meta.url)),
		},
	},
	ssr: {
		noExternal: ['@org/client-ts', '@org/shared-ts'],
	},
	test: {
		environment: 'node',
		server: {
			deps: {
				inline: ['@org/client-ts', '@org/shared-ts'],
			},
		},
		include: ['src/**/*.{test,spec}.{ts,tsx}'],
	},
});
