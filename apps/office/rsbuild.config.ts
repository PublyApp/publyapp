/* eslint-disable @typescript-eslint/no-shadow */
/* eslint-disable import/no-extraneous-dependencies */
import path from 'path';

import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';
import { pluginSvgr } from '@rsbuild/plugin-svgr';
import dotenv from 'dotenv';
import dotenvExpand from 'dotenv-expand';
import _ from 'lodash';

const { APP_ENV } = process.env;

const isLocal = APP_ENV === 'local' || APP_ENV === 'production-local';
const isProduction = APP_ENV === 'production' || APP_ENV === 'production-local';

let envFileName: string | null = '.env.local';

// ! for local build
if (isProduction && isLocal) {
	envFileName = '.env.production';
} else if (isProduction && !isLocal) {
	// on an online environment where env variables
	// are defined outside of a .env file (for security reasons)
	// on vercel for example
	envFileName = null;
} else if (!isProduction && !isLocal) {
	envFileName = '.env.preprod';
}

let env: Record<string, string> | undefined;

if (envFileName) {
	const envConfig = dotenv.config({ path: path.resolve(__dirname, envFileName) });
	const { parsed } = dotenvExpand.expand(envConfig);
	env = parsed ?? {};
}

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
		// define: _.assign({}, getDefinedEnv(env ?? (process.env as never))),
		define: getDefinedEnv(env ?? (process.env as never)),
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
	// tools: {
	// 	rspack: {
	// 		builtins: {
	// 			emotion: true,
	// 			react: {
	// 				importSource: '@emotion/react',
	// 			},
	// 		},
	// 	},
	// },
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
