/* eslint-disable @typescript-eslint/no-var-requires */
const esbuild = require('esbuild');

const { buildOptions } = require('./build');

async function watch() {
	const ctx = await esbuild.context(buildOptions);

	ctx.watch();
	console.log('esbuild watching for changes...');
}

watch();
