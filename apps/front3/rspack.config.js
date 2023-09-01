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
