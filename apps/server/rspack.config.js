/* eslint-disable @typescript-eslint/no-use-before-define */
/* eslint-disable @typescript-eslint/no-var-requires */
const path = require('path');
const fs = require('fs');

const MONOREPO_ROOT_DIR = path.resolve(__dirname, '../../');
const APPS_DIR = path.join(MONOREPO_ROOT_DIR, 'apps');
const PACKAGES_DIR = path.join(MONOREPO_ROOT_DIR, 'packages');
const PACKAGE_FILE = 'package.json';

const toDeploy = ['preprod', 'production'].includes(process.env.APP_ENV);

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
	// const a = fs.readFileSync(path.join(MONOREPO_ROOT_DIR, PACKAGE_FILE), { encoding: 'utf8' });

	const externalsSet = new Set();

	[...appDirs, ...packagesDirs].forEach((dirName) => {
		const filePath = path.join(dirName, PACKAGE_FILE);

		if (!fs.existsSync(filePath)) return;

		const packageFile = JSON.parse(fs.readFileSync(filePath, { encoding: 'utf-8' }));

		if (packageFile.dependencies) {
			// eslint-disable-next-line no-restricted-syntax
			Object.entries(packageFile.dependencies).forEach(([key, value]) => {
				if (value === 'workspace:*') return;
				externalsSet.add(key);
			});
		}

		if (packageFile.devDependencies) {
			// eslint-disable-next-line no-restricted-syntax
			Object.entries(packageFile.devDependencies).forEach(([key, value]) => {
				if (value === 'workspace:*') return;
				externalsSet.add(key);
			});
		}
	});

	return [...externalsSet];
}

/** @type {import('@rspack/cli').Configuration} */
module.exports = {
	entry: {
		index: path.resolve(__dirname, 'src/index.ts'),
		'cloud/index': path.resolve(__dirname, 'src/cloud/index.ts'),
		'seeding/seed': path.resolve(__dirname, 'src/seeding/seed.ts'),
	},
	output: {
		path: path.resolve(__dirname, 'dist'),
		filename: '[name].js',
	},
	target: 'node',
	mode: toDeploy ? 'production' : 'development',
	externalsType: 'commonjs',
	externals: [...findExternals(), 'parse/node'],
	resolve: {
		alias: {
			'@server': '.',
			'@shared': path.join(PACKAGES_DIR, 'shared'),
			// '@ui-react': path.join(PACKAGES_DIR, 'ui-react'), // ! warning! we are bundling for server here
		},
	},
};
