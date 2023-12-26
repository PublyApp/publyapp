/* eslint-disable no-console */
/* eslint-disable @typescript-eslint/naming-convention */
/* eslint-disable no-param-reassign */
/* eslint-disable @typescript-eslint/no-var-requires */
/* eslint-disable import/no-extraneous-dependencies */
/* eslint-disable prefer-arrow/prefer-arrow-functions */
/* eslint-disable func-style */

// @ts-check

const { spawn } = require('child_process');
const path = require('path');
// const fs = require('fs');

// const nodemon = require('nodemon');

const { createRsbuild, watch: _watch } = require('./config');

const run = async () => {
	const rsbuild = await createRsbuild();

	const watch = () => {
		_watch(rsbuild);
	};

	let startAppProcess = null;

	rsbuild.onDevCompileDone(async () => {
		if (startAppProcess) {
			startAppProcess.kill('SIGINT');
			// startAppProcess.kill('SIGKILL'); // ! subprocesses of subprocess are not killed
			startAppProcess = null;
		}

		startAppProcess = spawn('node', ['--enable-source-maps', 'dist/index.js'], {
			stdio: 'inherit',
			cwd: path.resolve(__dirname, '../../'),
		});
		// startAppProcess = spawn('npm.cmd', ['start'], { stdio: 'inherit', cwd: __dirname }); // ! subprocesses of subprocess are not killed
	});

	process.stdin.on('data', (data) => {
		const input = data.toString().trim();

		if (input === 'rs') {
			watch();
		}
	});

	watch();
};

run();
