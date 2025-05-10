import { externals } from "../rsbuild/config.mjs"
/**
 * @type {Bun.buildOptions}
 */
export const buildOptions = {
	entrypoints: ['./src/index.ts', './src/_seed.ts', './src/_migrations.ts', './src/_i18n.ts'],
	outdir: './dist',
	target: 'bun',
	naming: '[name].mjs',
	format: 'esm',
	sourcemap: 'external',
	external: externals,
	env: 'disable',
	minify: false,
	root: '../../',
}
