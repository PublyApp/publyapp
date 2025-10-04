import chalk from 'chalk';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { type Plugin } from 'vite';

const enableLog = true;
const enableDebug = false;
const logPrefix = '[generate-client]';
const _log = enableLog
	? (...args: any[]) => console.log(logPrefix, ...args)
	: () => {};
const _debug = enableDebug
	? (...args: any[]) => console.debug(logPrefix, ...args)
	: () => {};

const generateKiotaClient = (): Plugin => {
	const generateOrUpdateClient = async () => {
		try {
			const jsClientPath = path.resolve(
				process.cwd(),
				'../../packages/js-client',
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
		configureServer: async () => {
			await generateOrUpdateClient();
		},
	};
};

export default generateKiotaClient;
