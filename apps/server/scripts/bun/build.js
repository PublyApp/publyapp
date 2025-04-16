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
