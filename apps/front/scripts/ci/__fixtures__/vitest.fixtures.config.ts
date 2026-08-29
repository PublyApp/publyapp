import { defineConfig } from 'vitest/config';

export default defineConfig({
	resolve: {
		alias: {
			'~': './src',
		},
	},
	test: {
		include: ['scripts/ci/__fixtures__/**/*.test.ts'],
	},
});
