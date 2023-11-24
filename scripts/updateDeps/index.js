/* eslint-disable @typescript-eslint/no-var-requires */

const { spawnSync } = require('child_process');
const path = require('path');

const onWindows = /^win/.test(process.platform);
const npmCommand = onWindows ? 'pnpm.cmd' : 'pnpm';

const MONOREPO_ROOT_DIR = path.resolve(__dirname, '../../');

const PACKAGES_DIR = path.join(MONOREPO_ROOT_DIR, 'packages');
const APPS_DIR = path.join(MONOREPO_ROOT_DIR, 'apps');

// ! folder names
const apps = ['server', 'office', 'front'];
const packages = [
	'eslint-config-custom-base',
	'eslint-config-custom-common-react',
	'eslint-config-custom-nextjs',
	'eslint-config-custom-react',
	'eslint-config-custom-server',
	'shared',
	'tsconfig',
	'ui-react',
];

const cwdPaths = ['.'];

const getHandler = (basePath) => {
	return (e) => {
		cwdPaths.push(path.join(basePath, e));
	};
};

apps.forEach(getHandler(APPS_DIR));
packages.forEach(getHandler(PACKAGES_DIR));

for (const cwdPath of cwdPaths) {
	console.log('====================================');
	console.log('🔥', cwdPath);
	console.log('====================================');
	spawnSync(npmCommand, ['update'], { cwd: cwdPath, stdio: 'inherit' });
}

process.exit(0);
