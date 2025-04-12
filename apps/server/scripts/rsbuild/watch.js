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

const _ = require('lodash');

const chokidar = require('chokidar');

const {
	createRsbuild,
	watch: _watch,
	createI18nResourcesFiles,
} = require('./config');

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
		const { resources } = await import(
			`../../dist/i18n.mjs?update=${Date.now()}`
		); // we want the updated version and not the cached one
		await createI18nResourcesFiles(resources);

		// kill previous app process and start a new one
		if (startAppProcess) {
			startAppProcess.kill('SIGINT');
			startAppProcess = null;
		}

		const startCommand = ['node', '--enable-source-maps', 'dist/index.mjs'];

		// eslint-disable-next-line arrow-body-style
		console.log(
			'\x1b[32m%s\x1b[0m',
			'====>',
			startCommand
				.map((arg) => {
					return arg.includes(' ') ? `"${arg}"` : arg;
				})
				.join(' '),
		);

		const [node, ...args] = startCommand;

		startAppProcess = spawn(node, args, {
			stdio: 'inherit',
			cwd: path.resolve(__dirname, '../../'),
			env: _.assign({}, process.env, {
				// even during development, set NODE_ENV to production
				// so that we can have production-like behavior
				// (e.g. the app will not crash on missing env variables + better performance)
				// To differentiate between development and production, use process.env.MODE instead of process.env.NODE_ENV
				// (MODE is set by the user in the .env.local file or at node command line launch)
				NODE_ENV: 'production',
			}),
		});

		// ! subprocesses of subprocess are not killed
		// startAppProcess = spawn('npm.cmd', ['start'], { stdio: 'inherit', cwd: __dirname });
	});

	process.stdin.on('data', (data) => {
		const input = data.toString().trim();

		if (input === 'rs') {
			watch();
		}
	});

	chokidar
		.watch(path.resolve(__dirname, '../../.env.local'))
		.on('change', () => {
			watch();
		});

	watch();
};

run();
