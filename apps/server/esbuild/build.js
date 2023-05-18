/* eslint-disable @typescript-eslint/no-var-requires */
const esbuild = require('esbuild');
const { nodeExternalsPlugin } = require('esbuild-node-externals');
const { packageNames } = require('./esbuild.utils');
const path = require('path');

const buildOptions = {
	entryPoints: [path.resolve(__dirname, '../src/index.ts')],
	bundle: true,
	platform: 'node',
	outfile: path.resolve(__dirname, '../dist/index.js'),
	sourcemap: true,
	plugins: [
		nodeExternalsPlugin({
			allowList: [...packageNames],
		}),
	],
};

exports.buildOptions = buildOptions;

async function build() {
	esbuild.build(buildOptions);
}

build();
