/* eslint-disable import/no-extraneous-dependencies */
/* eslint-disable @typescript-eslint/no-var-requires */
const esbuild = require('esbuild');

const { cloudBuildOptions } = require('./build.cloud');

async function watch() {
	const ctx = await esbuild.context(cloudBuildOptions);

	ctx.watch();
	console.log('[cloud] esbuild watching for changes...');
}

watch();
