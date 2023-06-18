/* eslint-disable import/no-extraneous-dependencies */
/* eslint-disable @typescript-eslint/no-var-requires */
const esbuild = require('esbuild');

const { buildOptions } = require('./build');

async function watch() {
	const ctx = await esbuild.context(buildOptions);

	ctx.watch();
	console.log('[main] esbuild watching for changes...');
}

watch();
