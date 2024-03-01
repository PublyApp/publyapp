/* eslint-disable import/no-extraneous-dependencies */
/* eslint-disable prefer-arrow/prefer-arrow-functions */
/* eslint-disable func-style */
/* eslint-disable @typescript-eslint/no-var-requires */
const fs = require('fs');
const path = require('path');

const { nodeExternalsPlugin } = require('esbuild-node-externals');

const packagesDir = path.resolve(__dirname, '../../../../packages'); // replace with the path to your packages directory

function getPackageNames() {
	const packageNames = [];
	fs.readdirSync(packagesDir).forEach((packageName) => {
		const packageJsonPath = path.join(packagesDir, packageName, 'package.json');
		const packageJson = JSON.parse(fs.readFileSync(packageJsonPath));
		packageNames.push(packageJson.name);
	});
	return packageNames;
}

// exports.getPackageNames = getPackageNames;
// exports.packageNames = getPackageNames();

const buildOptions = {
	entryPoints: [
		path.resolve(__dirname, '../../src/index.ts'),
		// path.resolve(__dirname, '../../src/cloud/_index.ts'),
		path.resolve(__dirname, '../../src/seeding/seed.ts'),
	],
	bundle: true,
	platform: 'node',
	format: 'esm',
	outExtension: {
		'.js': '.mjs',
	},
	// external: ['@remix-run/express'],
	// outfile: path.resolve(__dirname, '../dist/index.js'),
	outdir: path.resolve(__dirname, '../../dist'),
	sourcemap: true,
	plugins: [
		nodeExternalsPlugin({
			allowList: [...getPackageNames()],
		}),
	],
};

exports.buildOptions = buildOptions;
