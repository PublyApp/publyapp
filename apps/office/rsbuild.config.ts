/* eslint-disable @typescript-eslint/no-shadow */
/* eslint-disable import/no-extraneous-dependencies */
import path from 'path';

import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';
import { pluginSvgr } from '@rsbuild/plugin-svgr';
import dotenv from 'dotenv';
import dotenvExpand from 'dotenv-expand';
import _ from 'lodash';

const MODE = process.env.MODE || 'local';

const envFileName = `.env.${MODE}`;

const envConfig = dotenv.config({ path: path.resolve(__dirname, envFileName) });
const { parsed: env } = dotenvExpand.expand(envConfig);

const getDefinedEnv = (env: Record<string, string>) => {
	const definedEnv: Record<string, string> = {};

	_.entries(env).forEach(([key, value]) => {
		definedEnv[`process.env.${key}`] = JSON.stringify(value);
	});

	return definedEnv;
};

export default defineConfig({
	plugins: [pluginReact(), pluginSvgr()],
	source: {
		entry: {
			index: './src/main.tsx', // the key ('index' in our case here) must match our html's file name
		},
		define: getDefinedEnv(env || (process.env as never)),
		// alias: {
		// 	'react-i18next': require.resolve('react-i18next'),
		// },
	},
	html: {
		template: 'index.html',
	},
	output: {
		copy: {
			patterns: [{ from: 'public' }],
		},
	},
	server: {
		port: 6182,
		historyApiFallback: true,
	},
	tools: {
		rspack: {
			module: {
				rules: [
					{
						test: /\.tsx$/,
						loader: 'builtin:swc-loader',
						options: {
							jsc: {
								transform: {
									react: {
										importSource: '@emotion/react',
										runtime: 'automatic',
									},
								},
							},
							rspackExperiments: {
								emotion: true,
							},
						},
						type: 'javascript/auto',
					},
				],
			},
		},
	},
});
