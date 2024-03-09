// import { findExternals } from './scripts/rsbuild/config'
// const { findExternals } = require('./scripts/rsbuild/config');
import { findExternals } from '../rsbuild/config';

Bun.build({
	entrypoints: ['./src/index.ts'],
	outdir: 'dist2',
	target: 'node',
	naming: '[name].mjs',
	format: 'esm',
	sourcemap: 'external',
	external: [
		...findExternals(),
		'parse/node',
		'parse-server/lib/Config',
		'parse-server/lib/Auth',

		'parse/node.js',
		'parse-server/lib/Config.js',
		'parse-server/lib/Auth.js',
		'parse-server/lib/Config.js',

		'parse-server/lib/Config',
		'parse-server/lib/Auth.js',
		'parse-server/lib/Auth',
		'parse-server/lib/RestWrite.js',
		'parse-server/lib/RestWrite',
		'parse-server/lib/Routers/UsersRouter.js',

		'parse-server/lib/index.js',

		'parse-server/lib/logger',
		'parse-server/lib/logger.js',

		'front/build/server/index.js',
	],
});
