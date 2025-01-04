/* eslint-disable import/no-extraneous-dependencies */
import { reactRouter } from '@react-router/dev/vite';
import { vanillaExtractPlugin } from '@vanilla-extract/vite-plugin';
import { defineConfig } from 'vite';
// import { nodePolyfills } from 'vite-plugin-node-polyfills';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
	plugins: [vanillaExtractPlugin(), reactRouter(), tsconfigPaths() /* nodePolyfills() */],
	server: {
		port: 6181,
	},
	define: {
		'process.env.MODE_DEBUG': false,
		'process.nextTick': '() => {}',
		setImmediate: '() => {}',
	},
});
