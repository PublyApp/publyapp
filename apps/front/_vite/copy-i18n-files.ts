import fs from 'node:fs';
import path from 'node:path';
import { normalizePath, type Plugin } from 'vite';

type PluginCopyOptions = {
	targets: { src: string; dest: string }[];
};

const targets: PluginCopyOptions['targets'] = [
	{
		src: normalizePath(
			path.resolve(process.cwd(), '../../packages/shared/lib/i18n/json'),
		),
		dest: normalizePath(path.resolve(process.cwd(), 'public/tx')),
	},
];

const copyI18nFiles = (): Plugin => {
	const copyFiles = async () => {
		const tasks: Promise<void>[] = [];

		targets.forEach(({ src, dest }) => {
			const task = fs.promises.cp(src, dest, { recursive: true });
			task.then(() => {
				console.log(`Copied ${src} to ${dest}`);
			});
			tasks.push(task);
		});

		await Promise.all(tasks).then(() => {
			console.log('Copied all files');
		});
	};

	return {
		name: '@rog/vite-plugin-copy',
		// Remove apply to run in both dev and build modes
		configureServer: async () => {
			await copyFiles();
		},
		buildStart: async () => {
			await copyFiles();
		},
	};
};

export default copyI18nFiles;
