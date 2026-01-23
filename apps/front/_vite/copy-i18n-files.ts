import fs, { watch } from 'node:fs';
import path from 'node:path';

import chalk from 'chalk';
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

const enableLog = true;
const enableDebug = false;
const logPrefix = '[copy-i18n-files]';
const _log = enableLog
	? (...args: unknown[]) => console.log(logPrefix, ...args)
	: () => {};
const _debug = enableDebug
	? (...args: unknown[]) => console.debug(logPrefix, ...args)
	: () => {};

const copyI18nFiles = (): Plugin => {
	const copyFiles = async () => {
		const tasks: Promise<void>[] = [];

		targets.forEach(({ src, dest }) => {
			const task = (async () => {
				try {
					// Ensure destination directory exists
					await fs.promises.mkdir(dest, { recursive: true });

					// Read source directory contents
					const sourceFiles = await fs.promises.readdir(src);

					// Copy each file individually
					for (const file of sourceFiles) {
						const srcPath = path.join(src, file);
						const destPath = path.join(dest, file);

						// Check if it's a file (not a directory)
						const stat = await fs.promises.stat(srcPath);
						if (stat.isFile() && file.endsWith('.json')) {
							// Copy the file (overwrites existing file)
							await fs.promises.copyFile(srcPath, destPath);
							_debug(`copied ${srcPath} to ${destPath}`);
						}
					}
				} catch (error) {
					console.error(`Error copying from ${src} to ${dest}:`, error);
					throw error;
				}
			})();

			task.then(() => {
				_debug(`copied ${src} to ${dest}`);
			});
			tasks.push(task);
		});

		await Promise.all(tasks).then(() => {
			_log(chalk.cyan('i18n files copied'));
		});
	};

	return {
		name: '@rog/vite-plugin-copy-i18n-files',
		configureServer(server) {
			// initial copy
			void copyFiles();

			// Use Node.js fs.watch for independent file watching
			const sourceDir = normalizePath(
				path.resolve(process.cwd(), '../../packages/shared/lib/i18n/json'),
			);

			let t: NodeJS.Timeout | null = null;
			const notify = (file?: string) => {
				if (t) clearTimeout(t);
				t = setTimeout(async () => {
					await copyFiles();

					// Send HMR event with a small delay to ensure files are copied
					setTimeout(() => {
						_debug('Sending HMR event: i18n:updated');
						server.ws.send({
							type: 'custom',
							event: 'i18n:updated',
							data: { file, ts: Date.now() },
						});
					}, 50);
				}, 100);
			};

			// Use Node.js fs.watch instead of Vite's watcher
			const watcher = watch(
				sourceDir,
				{ recursive: true },
				async (_eventType, filename) => {
					if (filename?.endsWith('.json')) {
						const fullPath = path.join(sourceDir, filename);

						// Check if file still exists to detect deletions
						try {
							await fs.promises.access(fullPath);
							// File exists - it's an add or change event
							_debug('change detected:', fullPath);
							notify(fullPath);
						} catch {
							// File doesn't exist - it's a deletion
							_debug('delete detected:', fullPath);

							// Remove from destination
							const destPath = path.join(
								path.resolve(process.cwd(), 'public/tx'),
								filename,
							);

							try {
								await fs.promises.unlink(destPath);
								_debug(`removed ${destPath}`);
							} catch (error) {
								// Ignore if file doesn't exist
								if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
									console.warn(`Failed to remove ${destPath}:`, error);
								}
							}

							// Still notify for HMR
							notify(fullPath);
						}
					}
				},
			);

			// Clean up watcher when server closes
			server.httpServer?.on('close', () => {
				_debug('Server closing, cleaning up i18n watcher');
				watcher.close();
			});
		},
		buildStart: async () => {
			await copyFiles();
		},
	};
};

export default copyI18nFiles;
