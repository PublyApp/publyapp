import { spawn } from 'node:child_process';
import path from 'node:path';
// @ts-check
import chokidar from 'chokidar';
import _ from 'lodash';
import {
	watch as _watch,
	createI18nResourcesFiles,
	createRsbuild,
} from './config.mjs';

const args = process.argv.slice(2);

let inspect = false;

if (args.includes('--inspect')) {
	inspect = true;
}

const run = async () => {
	const rsbuild = await createRsbuild();

	let startAppProcess = null;

	// onDevCompileDone does not work anymore, IDK why
	rsbuild
		.onAfterBuild
		// .onDevCompileDone
		(async () => {
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

			const startCommand = [
				'node',
				...(inspect ? ['--inspect', '--inspect-port=6183'] : []),
				'--enable-source-maps', 'dist/index.mjs'
			];

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

			// ! subprocesses of subprocess are not killed
			// startAppProcess = spawn('npm.cmd', ['start'], { stdio: 'inherit', cwd: import.meta.dirname });
		});

	const watch = () => {
		_watch(rsbuild);
	};

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
