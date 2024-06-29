/* eslint-disable @typescript-eslint/no-var-requires */
// import { findExternals } from './scripts/rsbuild/config'
// const { findExternals } = require('./scripts/rsbuild/config');
const { externals } = require('../rsbuild/config');

Bun.build({
	entrypoints: ['./src/index.ts', './src/seed.ts'],
	outdir: 'dist',
	target: 'node',
	naming: '[name].mjs',
	format: 'esm',
	sourcemap: 'external',
	external: externals,
});
