// import { findExternals } from './scripts/rsbuild/config'
// const { findExternals } = require('./scripts/rsbuild/config');
import { externals } from '../rsbuild/config';

Bun.build({
	entrypoints: ['./src/index.ts'],
	outdir: 'dist',
	target: 'node',
	naming: '[name].mjs',
	format: 'esm',
	sourcemap: 'external',
	external: externals,
});
