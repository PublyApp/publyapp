// @ts-check
import { spawn } from 'node:child_process';
import path from 'node:path';
import _ from 'lodash';
import chokidar from 'chokidar';
import {
	createRsbuild,
	watch as _watch,
	createI18nResourcesFiles,
} from './config.mjs';

// set node env to development
// otherwise onDevCompileDone API will not be called
process.env.NODE_ENV = 'development';

const isBun = typeof Bun !== 'undefined';

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

		// const startCommand = ['node', '--enable-source-maps', 'dist/index.mjs'];
		const onWindows = /^win/.test(process.platform);
		const startCommand = [onWindows ? /* 'bun.cmd' */ 'bun' : 'bun', '--enable-source-maps', 'dist/index.mjs'];

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

		if (isBun) {
			console.log('🎯🎯🎯');
			startAppProcess = Bun.spawn({
				cmd: [node, ...args],
				stdio: ["inherit", "inherit", "inherit"],
				cwd: path.resolve(import.meta.dirname, '../../'),
				env: _.assign({}, process.env, {
					// even during development, set NODE_ENV to production
					// so that we can have production-like behavior
					// (e.g. the app will not crash on missing env variables + better performance)
					// To differentiate between development and production, use process.env.MODE instead of process.env.NODE_ENV
					// (MODE is set by the user in the .env.local file or at node command line launch)
					NODE_ENV: 'production',
				}),
			})
		} else {
			startAppProcess = spawn(node, args, {
				stdio: 'inherit',
				cwd: path.resolve(import.meta.dirname, '../../'),
				env: _.assign({}, process.env, {
					// even during development, set NODE_ENV to production
					// so that we can have production-like behavior
					// (e.g. the app will not crash on missing env variables + better performance)
					// To differentiate between development and production, use process.env.MODE instead of process.env.NODE_ENV
					// (MODE is set by the user in the .env.local file or at node command line launch)
					NODE_ENV: 'production',
				}),
			});
		}

		// ! subprocesses of subprocess are not killed
		// startAppProcess = spawn('npm.cmd', ['start'], { stdio: 'inherit', cwd: import.meta.dirname });
	});

	process.stdin.on('data', (data) => {
		const input = data.toString().trim();

		if (input === 'rs') {
			watch();
		}
	});

	chokidar
		.watch(path.resolve(import.meta.dirname, '../../.env.local'))
		.on('change', () => {
			watch();
		});

	watch();
};

run();
