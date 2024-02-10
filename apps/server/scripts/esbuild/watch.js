/* eslint-disable no-console */
/* eslint-disable prefer-arrow/prefer-arrow-functions */
/* eslint-disable func-style */
/* eslint-disable import/no-extraneous-dependencies */
/* eslint-disable @typescript-eslint/no-var-requires */

const { spawn } = require('child_process');
const path = require('path');

const esbuild = require('esbuild');

const { buildOptions } = require('./config');

let startAppProcess = null;

// https://stackoverflow.com/a/72975155/15003148
buildOptions.plugins.unshift({
	name: 'rebuild-notify',
	setup(build) {
		build.onEnd((result) => {
			console.log(`build ended with ${result.errors.length} errors`);

			// HERE: somehow restart the server from here, e.g., by sending a signal that you trap and react to inside the server.
			if (startAppProcess) {
				startAppProcess.kill('SIGINT');
				startAppProcess = null;
			}

			startAppProcess = spawn('node', ['--enable-source-maps', 'dist/index.mjs'], {
				stdio: 'inherit',
				cwd: path.resolve(__dirname, '../../'),
				env: {
					...process.env,
					// NODE_ENV: 'development',
				},
			});
		});
	},
});

// ensure we always get a non minified build
buildOptions.minify = false;

async function run() {
	const ctx = await esbuild.context(buildOptions);

	process.stdin.on('data', (data) => {
		const input = data.toString().trim();

		if (input === 'rs') {
			ctx.rebuild();
			console.log('esbuild rebuild done...');
		}
	});

	ctx.watch();
	console.log('esbuild watching for changes...');
}

run();
