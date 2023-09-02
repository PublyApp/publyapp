const { EnvironmentPlugin } = require('@rspack/core');
const dotenv = require('dotenv');
const dotenvExpand = require('dotenv-expand');

const envConfig = dotenv.config({ path: path.resolve(__dirname, '..', envFileName) });
dotenvExpand.expand(envConfig);

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
	devServer: {
		port: 6182,
	},
};

module.exports = config;
