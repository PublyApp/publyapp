import * as path from 'path';

import react from '@vitejs/plugin-react';
import { UserConfig } from 'vite';
import ssr from 'vite-plugin-ssr/plugin';

const config: UserConfig = {
	resolve: {
		alias: [
			// {
			// 	find: '@',
			// 	replacement: path.resolve(__dirname, 'src'),
			// },
			{
				find: 'parse',
				replacement: path.resolve(__dirname, './node_modules/parse/dist/parse.min.js'),
			},
		],
		// alias: {
		// 	parse: path.resolve(__dirname, './node_modules/parse/dist/parse.min.js'),
		// },
	},
	plugins: [react(), ssr()],
};

export default config;
