/* eslint-disable @typescript-eslint/no-var-requires */
const fs = require('fs');
const path = require('path');

const packagesDir = path.resolve(__dirname, '../../../packages'); // replace with the path to your packages directory

function getPackageNames() {
	const packageNames = [];
	fs.readdirSync(packagesDir).forEach((packageName) => {
		const packageJsonPath = path.join(packagesDir, packageName, 'package.json');
		const packageJson = JSON.parse(fs.readFileSync(packageJsonPath));
		packageNames.push(packageJson.name);
	});
	return packageNames;
}

exports.getPackageNames = getPackageNames;
exports.packageNames = getPackageNames();
