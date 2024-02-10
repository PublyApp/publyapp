/* eslint-disable prefer-arrow/prefer-arrow-functions */
/* eslint-disable import/no-extraneous-dependencies */
/* eslint-disable func-style */
/* eslint-disable @typescript-eslint/no-var-requires */
/* eslint-disable import/order */
const esbuild = require('esbuild');
const { nodeExternalsPlugin } = require('esbuild-node-externals');
const { packageNames } = require('./esbuild.utils');
const path = require('path');

const buildOptions = {
	entryPoints: [path.resolve(__dirname, '../../src/index.ts'), path.resolve(__dirname, '../../src/cloud/_index.ts')],
	bundle: true,
	platform: 'node',
	format: 'esm',
	outExtension: {
		'.js': '.mjs',
	},
	// outfile: path.resolve(__dirname, '../dist/index.js'),
	outdir: path.resolve(__dirname, '../../dist'),
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
