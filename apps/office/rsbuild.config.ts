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
			index: './src/main.tsx',
		},
		define: getDefinedEnv(env || (process.env as never)),
		alias: {
			// 	'react-i18next': path.resolve(
			// 		__dirname,
			// 		'node_modules/@devist/ui-react/node_modules/react-i18next/dist/commonjs/index.js',
			// 	),
			'react-i18next': require.resolve('react-i18next'),
		},
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
