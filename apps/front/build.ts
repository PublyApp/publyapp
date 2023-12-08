/* eslint-disable @typescript-eslint/naming-convention */
/* eslint-disable no-param-reassign */
/* eslint-disable @typescript-eslint/no-var-requires */
/* eslint-disable import/no-extraneous-dependencies */
/* eslint-disable prefer-arrow/prefer-arrow-functions */
/* eslint-disable func-style */
import fs from 'fs';
import path from 'path';

import { createRsbuild } from '@rsbuild/core';

const MONOREPO_ROOT_DIR = path.resolve(__dirname, '../../');
const APPS_DIR = path.join(MONOREPO_ROOT_DIR, 'apps');
const PACKAGES_DIR = path.join(MONOREPO_ROOT_DIR, 'packages');
const PACKAGE_FILE = 'package.json';

const toDeploy = ['preprod', 'production'].includes(process.env.APP_ENV || '');

function listDirectories(pth: string) {
	const directories = fs
		.readdirSync(pth, { withFileTypes: true })
		.filter((dirent) => {
			return dirent.isDirectory();
		})
		.map((dir) => {
			return path.join(pth, dir.name);
		});

	return directories;
}

function findExternals() {
	// read all apps package.json
	const appDirs = listDirectories(APPS_DIR);
	const packagesDirs = listDirectories(PACKAGES_DIR);

	const externalsSet = new Set<string>();

	[...appDirs, ...packagesDirs].forEach((dirName) => {
		const filePath = path.join(dirName, PACKAGE_FILE);

		if (!fs.existsSync(filePath)) return;

		const packageFile = JSON.parse(fs.readFileSync(filePath, { encoding: 'utf-8' }));

		if (packageFile.dependencies) {
			Object.entries(packageFile.dependencies).forEach(([key, value]) => {
				if (value === 'workspace:*') return;
				externalsSet.add(key);
			});
		}

		if (packageFile.devDependencies) {
			Object.entries(packageFile.devDependencies).forEach(([key, value]) => {
				if (value === 'workspace:*') return;
				externalsSet.add(key);
			});
		}
	});

	return [...externalsSet];
}

const run = async () => {
	const rsbuild = await createRsbuild({
		target: 'node',
		rsbuildConfig: {
			source: {
				entry: {
					index: './app/entry.server.tsx',
				},
			},
			output: {
				distPath: {
					server: '',
					// root: 'build',
				},
				externals: [...findExternals(), 'parse/node', 'parse-server/lib/Config', 'parse-server/lib/Auth'],
			},
		},
	});

	await rsbuild.build({
		mode: toDeploy ? 'production' : 'development',
	});
};

run();
