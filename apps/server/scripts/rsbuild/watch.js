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
const fs = require('fs');

const chokidar = require('chokidar');

const { createRsbuild, watch: _watch } = require('./config');

// set node env to development
// otherwise onDevCompileDone API will not be called
process.env.NODE_ENV = 'development';

const run = async () => {
	const rsbuild = await createRsbuild();

	const watch = () => {
		_watch(rsbuild);
	};

	let startAppProcess = null;

	rsbuild.onDevCompileDone(async () => {
		// create the i18n resources files in .jsonc format
		const { resources } = await import(`../../dist/i18n.mjs?update=${Date.now()}`); // we want the updated version and not the cached one
		Object.entries(resources).forEach(([lang, namespaces]) => {
			Object.entries(namespaces).forEach(([namespace, data]) => {
				const filePath = path.join(__dirname, `../../dist/resources/${lang}.${namespace}.jsonc`);
				const dir = path.dirname(filePath);

				if (!fs.existsSync(dir)) {
					fs.mkdirSync(dir, { recursive: true });
				}

				fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
			});
		});

		// kill previous app process and start a new one
		if (startAppProcess) {
			startAppProcess.kill('SIGINT');
			startAppProcess = null;
		}

		startAppProcess = spawn('node', ['--enable-source-maps', /* '--trace-deprecation', */ 'dist/index.mjs'], {
			stdio: 'inherit',
			cwd: path.resolve(__dirname, '../../'),
			env: {
				...process.env,
				// NODE_ENV: 'development',
			},
		});
		// startAppProcess = spawn('npm.cmd', ['start'], { stdio: 'inherit', cwd: __dirname }); // ! subprocesses of subprocess are not killed
	});

	process.stdin.on('data', (data) => {
		const input = data.toString().trim();

		if (input === 'rs') {
			watch();
		}
	});

	chokidar.watch(path.resolve(__dirname, '../../.env.local')).on('change', () => {
		watch();
	});

	watch();
};

run();
