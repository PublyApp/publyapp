/* eslint-disable import/no-extraneous-dependencies */
/* eslint-disable @typescript-eslint/no-var-requires */
const path = require('path');

const dotenv = require('dotenv');
const dotenvExpand = require('dotenv-expand');
const { EnvironmentPlugin, HtmlRspackPlugin, CopyRspackPlugin } = require('@rspack/core');

const PACKAGES_DIR = path.resolve(__dirname, '../../packages');

const isLocal = process.env.APP_ENV === 'local';
const isProduction = process.env.APP_ENV === 'production';

let envFileName = '.env.local';

// ! for local build
if (isProduction && isLocal) {
	envFileName = '.env.production';
} else if (isProduction && !isLocal) {
	envFileName = null; // on vercel for example
} else if (!isProduction && !isLocal) {
	envFileName = '.env.preprod';
}

let env;

if (envFileName) {
	const envConfig = dotenv.config({ path: path.resolve(__dirname, envFileName) });
	const { parsed } = dotenvExpand.expand(envConfig);
	env = parsed;
}

/** @type {import('@rspack/cli').Configuration} */
const config = {
	entry: {
		main: './src/main.tsx', // Configure the project entry file
	},
	output: {
		publicPath: '/',
	},
	...(!isLocal
		? {
				optimization: {
					splitChunks: {
						chunks: 'all',
						maxSize: 60,
					},
				},
		  }
		: {}),
	plugins: [
		new EnvironmentPlugin(env ?? process.env),
		new HtmlRspackPlugin({
			template: './index.html', // Align CRA to generate index.html
		}),
		new CopyRspackPlugin({
			patterns: [
				{
					from: 'public',
				},
			],
		}),
	],
	devServer: {
		port: 6182,
		historyApiFallback: true,
	},
	resolve: {
		alias: {
			'@office': '.',
			'@shared': path.join(PACKAGES_DIR, 'shared'),
			'@ui-react': path.join(PACKAGES_DIR, 'ui-react'),
		},
	},
};

module.exports = config;
