/* eslint-disable import/no-extraneous-dependencies */
/* eslint-disable @typescript-eslint/no-var-requires */
const path = require('path');

const esbuild = require('esbuild');
const { nodeExternalsPlugin } = require('esbuild-node-externals');

const { packageNames } = require('./esbuild.utils');

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
