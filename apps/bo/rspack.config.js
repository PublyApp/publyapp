/* eslint-disable import/no-extraneous-dependencies */
/* eslint-disable @typescript-eslint/no-var-requires */
const path = require('path');

const dotenv = require('dotenv');
const dotenvExpand = require('dotenv-expand');
const { EnvironmentPlugin } = require('@rspack/core');

const isLocal = process.env.APP_ENV === 'local';
const isProduction = process.env.APP_ENV === 'production';

let envFileName = '.env.local';

if (isProduction) {
	envFileName = '.env.production';
} else if (!isProduction && !isLocal) {
	envFileName = '.env.preprod';
}

const envConfig = dotenv.config({ path: path.resolve(__dirname, envFileName) });
const { parsed: env } = dotenvExpand.expand(envConfig);

/** @type {import('@rspack/cli').Configuration} */
const config = {
	entry: {
		main: './src/main.tsx', // Configure the project entry file
	},
	builtins: {
		html: [
			{
				template: './index.html', // Align CRA to generate index.html
			},
		],
		copy: {
			patterns: [
				{
					from: 'public',
				},
			],
		},
	},
	plugins: [new EnvironmentPlugin(env)],
	devServer: {
		port: 6182,
	},
};

module.exports = config;
