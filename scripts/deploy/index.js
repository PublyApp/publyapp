/* eslint-disable import/no-extraneous-dependencies */
/* eslint-disable @typescript-eslint/no-var-requires */
const path = require('path');
const { spawnSync } = require('child_process');

const fse = require('fs-extra');

const MONOREPO_ROOT_DIR = path.resolve(__dirname, '../../');

const PACKAGES_DIRNAME = 'packages';
const APPS_DIRNAME = 'apps';

const APPS_DIR_SRC = path.join(MONOREPO_ROOT_DIR, APPS_DIRNAME);
const PACKAGES_DIR_SRC = path.join(MONOREPO_ROOT_DIR, PACKAGES_DIRNAME);

const onWindows = /^win/.test(process.platform);
const npxCommand = onWindows ? 'npx.cmd' : 'npx';
const command = onWindows ? 'corepack.cmd' : 'corepack';
// const command = onWindows ? 'pnpm.cmd' : 'pnpm';

const deployAppServer = ({
	//
	SERVER_APP_NAME,
}) => {
	const DEPLOY_ROOT_DIR = path.join(MONOREPO_ROOT_DIR, 'scripts', 'deploy', SERVER_APP_NAME, '.deploy');

	const APPS_DIR_DEST = path.join(DEPLOY_ROOT_DIR, APPS_DIRNAME);
	const PACKAGES_DIR_DEST = path.join(DEPLOY_ROOT_DIR, PACKAGES_DIRNAME);

	const SERVER_APP_DIR_SRC = path.join(APPS_DIR_SRC, SERVER_APP_NAME);
	const SERVER_APP_DIR_DEST = path.join(APPS_DIR_DEST, SERVER_APP_NAME);

	// --------------------------------------------------------------------------------------//
	//                             clean the destination folder                              //
	// --------------------------------------------------------------------------------------//
	fse.removeSync(DEPLOY_ROOT_DIR);
	fse.mkdirSync(DEPLOY_ROOT_DIR);

	// --------------------------------------------------------------------------------------//
	//                              copy package.json on root                                //
	// --------------------------------------------------------------------------------------//
	const packageJsonFileName = 'package.json';
	const rootPackageJsonSrc = path.join(MONOREPO_ROOT_DIR, packageJsonFileName);
	const rootPackageJsonDest = path.join(DEPLOY_ROOT_DIR, packageJsonFileName);
	fse.copyFileSync(rootPackageJsonSrc, rootPackageJsonDest);

	// --------------------------------------------------------------------------------------//
	//                                 copy lock file on root                                //
	// --------------------------------------------------------------------------------------//
	const lockFileName = 'pnpm-lock.yaml';
	const rootLockFileSrc = path.join(MONOREPO_ROOT_DIR, lockFileName);
	const rootLockFileDest = path.join(DEPLOY_ROOT_DIR, lockFileName);
	fse.copyFileSync(rootLockFileSrc, rootLockFileDest);

	// --------------------------------------------------------------------------------------//
	//                                copy pnpm-workspace file on root                       //
	// --------------------------------------------------------------------------------------//
	const workspaceFileName = 'pnpm-workspace.yaml';
	const workspaceFileSrc = path.join(MONOREPO_ROOT_DIR, workspaceFileName);
	const workspaceFileDest = path.join(DEPLOY_ROOT_DIR, workspaceFileName);
	fse.copyFileSync(workspaceFileSrc, workspaceFileDest);

	// --------------------------------------------------------------------------------------//
	//                                   copy .npmrc file on root                            //
	// --------------------------------------------------------------------------------------//
	const npmrcFileName = '.npmrc';
	const npmrcFileSrc = path.join(MONOREPO_ROOT_DIR, npmrcFileName);
	const npmrcFileDest = path.join(DEPLOY_ROOT_DIR, npmrcFileName);
	fse.copyFileSync(npmrcFileSrc, npmrcFileDest);

	// --------------------------------------------------------------------------------------//
	//                              copy the app's package.json                              //
	// --------------------------------------------------------------------------------------//
	const serverAppPackageJsonSrc = path.join(SERVER_APP_DIR_SRC, packageJsonFileName);
	const serverAppPackageJsonDest = path.join(SERVER_APP_DIR_DEST, packageJsonFileName);
	fse.mkdirpSync(SERVER_APP_DIR_DEST);
	fse.copyFileSync(serverAppPackageJsonSrc, serverAppPackageJsonDest);

	// --------------------------------------------------------------------------------------//
	//                                   copy the app.js                                    //
	// --------------------------------------------------------------------------------------//
	const appJsFileName = 'app.js';
	const appJsFileSrc = path.resolve(DEPLOY_ROOT_DIR, '..', appJsFileName);
	const appJsFileDest = path.join(DEPLOY_ROOT_DIR, appJsFileName);
	fse.copyFileSync(appJsFileSrc, appJsFileDest);

	// --------------------------------------------------------------------------------------//
	//                                   build the server                                    //
	// --------------------------------------------------------------------------------------//
	const buildArgs = ['turbo', 'run', 'build', `--filter=${SERVER_APP_NAME}`];
	spawnSync(npxCommand, buildArgs, { cwd: MONOREPO_ROOT_DIR, stdio: 'inherit' });

	// --------------------------------------------------------------------------------------//
	//                                   copy the builds                                     //
	// --------------------------------------------------------------------------------------//
	const serverBuildDirName = 'dist';
	const serverBuildSrc = path.join(SERVER_APP_DIR_SRC, serverBuildDirName);
	const serverBuildDest = path.join(SERVER_APP_DIR_DEST, serverBuildDirName);
	fse.copySync(serverBuildSrc, serverBuildDest);

	// --------------------------------------------------------------------------------------//
	//                                    copy packages                                      //
	// --------------------------------------------------------------------------------------//
	// copy only the package.json of each packages
	// list the contents of the packages directory
	const files = fse.readdirSync(path.join(PACKAGES_DIR_SRC));
	// Filter out non-directories
	const subdirectories = files.filter((file) => {
		return fse.statSync(path.join(PACKAGES_DIR_SRC, file)).isDirectory();
	});
	// Copy each subdirectory with only package.json to dist directory
	subdirectories.forEach((subdirectory) => {
		const sourcePath = path.join(PACKAGES_DIR_SRC, subdirectory, 'package.json');
		const destPath = path.join(PACKAGES_DIR_DEST, subdirectory, 'package.json');
		fse.copySync(sourcePath, destPath);
	});

	// --------------------------------------------------------------------------------------//
	//                                  set start command                                    //
	// --------------------------------------------------------------------------------------//
	// const mainFile = path.relative(MONOREPO_ROOT_DIR, path.join(SERVER_APP_DIR_SRC, serverBuildDirName, 'index.js'));
	const mainFile = path.relative(MONOREPO_ROOT_DIR, path.join(MONOREPO_ROOT_DIR, appJsFileName));
	// console.log(mainFile);
	const START_SCRIPT = `node ./${mainFile.replace(/\\/g, '/')}`;
	const args = ['pnpm', 'pkg', 'set', `scripts.start=${START_SCRIPT}`];
	spawnSync(command, args, {
		cwd: path.join(DEPLOY_ROOT_DIR),
		stdio: 'inherit',
	});
};

exports.deployAppServer = deployAppServer;
