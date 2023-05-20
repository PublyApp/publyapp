/* eslint-disable import/no-extraneous-dependencies */
/* eslint-disable @typescript-eslint/no-var-requires */
const path = require('path');

const esbuild = require('esbuild');
const { nodeExternalsPlugin } = require('esbuild-node-externals');

const { packageNames } = require('./esbuild.utils');

const cloudBuildOptions = {
	entryPoints: [path.resolve(__dirname, '../src/cloud/index.ts')],
	bundle: true,
	platform: 'node',
	outfile: path.resolve(__dirname, '../dist/cloud/index.js'),
	sourcemap: true,
	plugins: [
		nodeExternalsPlugin({
			allowList: [...packageNames],
		}),
	],
};

exports.cloudBuildOptions = cloudBuildOptions;

async function buildCloud() {
	esbuild.build(cloudBuildOptions);
}

buildCloud();
