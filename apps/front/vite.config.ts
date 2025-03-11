/* eslint-disable import/no-extraneous-dependencies */
import { reactRouter } from '@react-router/dev/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import checker from 'vite-plugin-checker';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
	plugins: [tailwindcss(), reactRouter(), tsconfigPaths(), checker({ typescript: true })],
	server: {
		port: 6181,
	},
});
