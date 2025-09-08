// import chalk from 'chalk';
// import fs from 'node:fs';
// import path from 'node:path';
// import { normalizePath, type Plugin } from 'vite';

// // type PluginCopyOptions = {
// // 	targets: { src: string; dest: string }[];
// // };

// // const targets: PluginCopyOptions['targets'] = [
// // 	{
// // 		src: normalizePath(
// // 			path.resolve(process.cwd(), '../../packages/shared/lib/i18n/json'),
// // 		),
// // 		dest: normalizePath(path.resolve(process.cwd(), 'public/tx')),
// // 	},
// // ];

// const enableLog = true;
// const enableDebug = false;
// const logPrefix = '[generate-client]';
// const _log = enableLog ? (...args: any[]) => console.log(logPrefix, ...args) : () => { };
// const _debug = enableDebug ? (...args: any[]) => console.debug(logPrefix, ...args) : () => { };

// const copyI18nFiles = (): Plugin => {
// 	const copyFiles = async () => {
// 		const tasks: Promise<void>[] = [];

// 		// targets.forEach(({ src, dest }) => {
// 		// 	const task = fs.promises.cp(src, dest, { recursive: true });
// 		// 	task.then(() => {
// 		// 		_debug(`copied ${src} to ${dest}`);
// 		// 	});
// 		// 	tasks.push(task);
// 		// });

// 		// await Promise.all(tasks).then(() => {
// 		// 	_log(chalk.cyan('i18n files copied'));
// 		// });
// 	};

// 	return {
// 		name: '@rog/vite-plugin-generate-client',
// 		// Remove apply to run in both dev and build modes
// 		configureServer: async () => {
// 			await copyFiles();
// 		},
// 		buildStart: async () => {
// 			await copyFiles();
// 		},
// 	};
// };

// export default copyI18nFiles;
