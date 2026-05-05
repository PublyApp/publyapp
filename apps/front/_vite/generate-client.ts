import { execSync } from 'node:child_process';
import fs, { watch } from 'node:fs';
import path from 'node:path';

import chalk from 'chalk';
import { normalizePath, type Plugin } from 'vite';

const enableLog = true;
const enableDebug = false;
const logPrefix = '[generate-client]';
const _log = enableLog
	? (...args: unknown[]) => console.log(logPrefix, ...args)
	: () => {};
const _debug = enableDebug
	? (...args: unknown[]) => console.debug(logPrefix, ...args)
	: () => {};

const generateKiotaClient = (): Plugin => {
	const generateOrUpdateClient = async () => {
		try {
			const jsClientPath = path.resolve(
				process.cwd(),
				'../../packages/client-ts',
			);
			const kiotaLockPath = path.join(jsClientPath, 'src/kiota-lock.json');
			const openApiPath = path.resolve(
				process.cwd(),
				'../../apps/api/openapi/MainApi.json',
			);

			// Check if OpenAPI spec exists
			if (!fs.existsSync(openApiPath)) {
				_log(
					chalk.yellow(
						'OpenAPI spec not found, skipping Kiota client generation',
					),
				);
				return;
			}

			// Check if kiota-lock.json exists to determine if we should generate or update
			const shouldGenerate = !fs.existsSync(kiotaLockPath);

			if (shouldGenerate) {
				_log(chalk.cyan('Generating Kiota client...'));
				_debug(
					`Running: dotnet kiota generate -d ${openApiPath} -o ${path.join(jsClientPath, 'src')} -l typescript -n MainApi.Client -c ApiClient`,
				);

				execSync(
					`dotnet kiota generate -d "${openApiPath}" -o "${path.join(jsClientPath, 'src')}" -l typescript -n MainApi.Client -c ApiClient`,
					{
						cwd: jsClientPath,
						stdio: 'inherit',
					},
				);
				_log(chalk.green('Kiota client generated successfully'));
			} else {
				_log(chalk.cyan('Updating Kiota client...'));
				_debug(
					`Running: dotnet kiota update -o ${path.join(jsClientPath, 'src')}`,
				);

				execSync(`dotnet kiota update -o "${path.join(jsClientPath, 'src')}"`, {
					cwd: jsClientPath,
					stdio: 'inherit',
				});
				_log(chalk.green('Kiota client updated successfully'));
			}
		} catch (error) {
			_log(chalk.red('Failed to generate/update Kiota client:'));
			console.error(error);
		}
	};

	return {
		name: '@rog/vite-plugin-generate-client',
		apply: 'serve', // Only run in development mode
		configureServer: async (server) => {
			// Initial generation/update
			await generateOrUpdateClient();

			// Watch the OpenAPI spec file for changes
			const openApiPath = normalizePath(
				path.resolve(process.cwd(), '../../apps/api/openapi/MainApi.json'),
			);

			// Check if the OpenAPI spec exists before setting up watcher
			if (!fs.existsSync(openApiPath)) {
				_log(
					chalk.yellow('OpenAPI spec not found, skipping file watcher setup'),
				);
				return;
			}

			let t: NodeJS.Timeout | null = null;
			const notify = (file?: string) => {
				if (t) clearTimeout(t);
				t = setTimeout(async () => {
					_log(chalk.cyan('OpenAPI spec changed, regenerating client...'));
					await generateOrUpdateClient();

					// Send HMR event with a small delay to ensure client is generated
					setTimeout(() => {
						_debug('Sending HMR event: kiota-client:updated');
						server.ws.send({
							type: 'custom',
							event: 'kiota-client:updated',
							data: { file, ts: Date.now() },
						});
					}, 50);
				}, 100);
			};

			// Watch the OpenAPI directory for changes
			const openApiDir = path.dirname(openApiPath);
			const watcher = watch(
				openApiDir,
				{ recursive: false },
				async (_eventType, filename) => {
					if (filename === 'MainApi.json') {
						const fullPath = path.join(openApiDir, filename);

						// Check if file still exists
						try {
							await fs.promises.access(fullPath);
							// File exists - it's an add or change event
							_debug('change detected:', fullPath);
							notify(fullPath);
						} catch {
							// File doesn't exist - it's a deletion
							_debug('delete detected:', fullPath);
							_log(
								chalk.yellow(
									'OpenAPI spec deleted, client generation disabled',
								),
							);
						}
					}
				},
			);

			// Clean up watcher when server closes
			server.httpServer?.on('close', () => {
				_debug('Server closing, cleaning up OpenAPI watcher');
				watcher.close();
			});
		},
	};
};

export default generateKiotaClient;
