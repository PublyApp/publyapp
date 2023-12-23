/* eslint-disable @typescript-eslint/naming-convention */
/* eslint-disable no-param-reassign */
/* eslint-disable @typescript-eslint/no-var-requires */
/* eslint-disable import/no-extraneous-dependencies */
/* eslint-disable prefer-arrow/prefer-arrow-functions */
/* eslint-disable func-style */

// @ts-check

const path = require('path');
const fs = require('fs');

const { createRsbuild } = require('@rsbuild/core');

const MONOREPO_ROOT_DIR = path.resolve(__dirname, '../../');
const APPS_DIR = path.join(MONOREPO_ROOT_DIR, 'apps');
const PACKAGES_DIR = path.join(MONOREPO_ROOT_DIR, 'packages');
const PACKAGE_FILE = 'package.json';

const toDeploy = ['preprod', 'production'].includes(process.env.APP_ENV || '');

/**
 * list directories of provided folder path
 * @param {string} pth
 * @returns {string[]}
 */
function listDirectories(pth) {
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

	/** @type {Set<string>} */
	const externalsSet = new Set();

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
		rsbuildConfig: {
			source: {
				entry: {
					index: './src/index.ts',
					'cloud/index': './src/cloud/index.ts',
					'seeding/seed': './src/seeding/seed.ts',
				},
			},
			output: {
				targets: ['node'],
				distPath: {
					server: '',
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
