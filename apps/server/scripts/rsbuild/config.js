/* eslint-disable global-require */
/* eslint-disable no-console */
/* eslint-disable @typescript-eslint/naming-convention */
/* eslint-disable no-param-reassign */
/* eslint-disable @typescript-eslint/no-var-requires */
/* eslint-disable import/no-extraneous-dependencies */
/* eslint-disable prefer-arrow/prefer-arrow-functions */
/* eslint-disable func-style */

// @ts-check

const path = require('path');
const fs = require('fs');

const { createRsbuild: _createRsbuild } = require('@rsbuild/core');
const { pluginTypeCheck } = require('@rsbuild/plugin-type-check');

const MONOREPO_ROOT_DIR = path.resolve(__dirname, '../../../../');

const APPS_DIR = path.join(MONOREPO_ROOT_DIR, 'apps');
const PACKAGES_DIR = path.join(MONOREPO_ROOT_DIR, 'packages');
const PACKAGE_FILE = 'package.json';

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

exports.listDirectories = listDirectories;

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

exports.findExternals = findExternals;

const externals = [
	...findExternals(),
	'parse-server/lib/index.js',

	'parse/node',
	'parse/node.js',

	'parse-server/lib/Auth',
	'parse-server/lib/Auth.js',

	'parse-server/lib/Config.js',
	'parse-server/lib/Config',

	'parse-server/lib/RestWrite',
	'parse-server/lib/RestWrite.js',

	'parse-server/lib/Routers/UsersRouter',
	'parse-server/lib/Routers/UsersRouter.js',

	'parse-server/lib/Adapters/Storage/Mongo/MongoSchemaCollection',
	'parse-server/lib/Adapters/Storage/Mongo/MongoSchemaCollection.js',

	'parse-server/lib/logger',
	'parse-server/lib/logger.js',

	'parse-server/lib/cryptoUtils',
	'parse-server/lib/cryptoUtils.js',

	'parse-server/lib/password',
	'parse-server/lib/password.js',

	'parse-server/lib/defaults',
	'parse-server/lib/defaults.js',

	'front/build/server/index.js',
];

exports.externals = externals;

function createRsbuild() {
	return _createRsbuild({
		rsbuildConfig: {
			plugins: [pluginTypeCheck()],
			source: {
				entry: {
					index: './src/index.ts',
					seed: './src/_seed.ts',
					migrations: './src/_migrations.ts',
				},
			},
			output: {
				target: 'node',
				externals,
			},
			tools: {
				rspack: {
					output: {
						libraryTarget: 'module',
						module: true,
						chunkFormat: 'module',
						filename: '[name].mjs',
					},
				},
			},
		},
	});
}

exports.createRsbuild = createRsbuild;

/**
 *
 * @param {import('@rsbuild/core').RsbuildInstance} rsbuild
 */
function watch(rsbuild) {
	rsbuild.build({
		watch: true,
	});
}

exports.watch = watch;

/**
 *
 * @param {import('@rsbuild/core').RsbuildInstance} rsbuild
 */
function build(rsbuild) {
	rsbuild.build();
}

exports.build = build;
