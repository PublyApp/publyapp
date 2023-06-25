/* eslint-disable import/no-extraneous-dependencies */
/* eslint-disable @typescript-eslint/no-var-requires */
const path = require('path');

const esbuild = require('esbuild');
const { nodeExternalsPlugin } = require('esbuild-node-externals');

const { packageNames } = require('./esbuild.utils');

const seedBuildOptions = {
	entryPoints: [path.resolve(__dirname, '../src/seeding/seed.ts')],
	bundle: true,
	platform: 'node',
	outfile: path.resolve(__dirname, '../dist/seeding/seed.js'),
	sourcemap: true,
	plugins: [
		nodeExternalsPlugin({
			allowList: [...packageNames],
		}),
	],
};

async function buildSeed() {
	esbuild.build(seedBuildOptions);
}

buildSeed();
