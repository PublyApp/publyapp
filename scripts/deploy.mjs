// @ts-check
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import _ from 'lodash';
import fse from 'fs-extra';

const MONOREPO_ROOT_DIR = path.resolve(import.meta.dirname, '../');

const PACKAGES_DIRNAME = 'packages';
const APPS_DIRNAME = 'apps';
const SERVER_APP_NAME = 'server';
const FRONT_APP_NAME = 'front';

const APPS_DIR_SRC = path.join(MONOREPO_ROOT_DIR, APPS_DIRNAME);
const PACKAGES_DIR_SRC = path.join(MONOREPO_ROOT_DIR, PACKAGES_DIRNAME);

// const onWindows = /^win/.test(process.platform);
const npxCommand = /* onWindows ? 'bunx.cmd' : */ 'bunx';
const bunCommand = /* onWindows ? 'bun.cmd' : */ 'bun';

const DEPLOY_ROOT_DIR = path.join(MONOREPO_ROOT_DIR, 'scripts', 'build');

const APPS_DIR_DEST = path.join(DEPLOY_ROOT_DIR, APPS_DIRNAME);
const PACKAGES_DIR_DEST = path.join(DEPLOY_ROOT_DIR, PACKAGES_DIRNAME);

const SERVER_APP_DIR_SRC = path.join(APPS_DIR_SRC, SERVER_APP_NAME);
const SERVER_APP_DIR_DEST = path.join(APPS_DIR_DEST, SERVER_APP_NAME);

const FRONT_APP_DIR_SRC = path.join(APPS_DIR_SRC, FRONT_APP_NAME);
const FRONT_APP_DIR_DEST = path.join(APPS_DIR_DEST, FRONT_APP_NAME);

// --------------------------------------------------------------------------------------//
//                             clean the destination folder                              //
// --------------------------------------------------------------------------------------//
fse.removeSync(DEPLOY_ROOT_DIR);
fse.mkdirSync(DEPLOY_ROOT_DIR);

// // ! I don't need a dockerfile, use default nixpacks system
// copy DockerFile
const dockerFileSrc = path.join(MONOREPO_ROOT_DIR, 'Dockerfile-Bun');
const dockerFileDest = path.join(DEPLOY_ROOT_DIR, 'Dockerfile');
fse.copyFileSync(dockerFileSrc, dockerFileDest);

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
const lockFileName = 'bun.lock';
const rootLockFileSrc = path.join(MONOREPO_ROOT_DIR, lockFileName);
const rootLockFileDest = path.join(DEPLOY_ROOT_DIR, lockFileName);
fse.copyFileSync(rootLockFileSrc, rootLockFileDest);

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
// server
const serverAppPackageJsonSrc = path.join(
	SERVER_APP_DIR_SRC,
	packageJsonFileName,
);
const serverAppPackageJsonDest = path.join(
	SERVER_APP_DIR_DEST,
	packageJsonFileName,
);
fse.mkdirpSync(SERVER_APP_DIR_DEST);
fse.copyFileSync(serverAppPackageJsonSrc, serverAppPackageJsonDest);

// front
const frontAppPackageJsonSrc = path.join(
	FRONT_APP_DIR_SRC,
	packageJsonFileName,
);
const frontAppPackageJsonDest = path.join(
	FRONT_APP_DIR_DEST,
	packageJsonFileName,
);
fse.mkdirpSync(FRONT_APP_DIR_DEST);
fse.copyFileSync(frontAppPackageJsonSrc, frontAppPackageJsonDest);

// copy patch file (server)
const patchFileName = 'patch.mjs';
const patchFileSrc = path.join(SERVER_APP_DIR_SRC, 'scripts', patchFileName);
const patchFileDest = path.join(SERVER_APP_DIR_DEST, 'scripts', patchFileName);
fse.mkdirpSync(path.join(SERVER_APP_DIR_DEST, 'scripts'));
fse.copyFileSync(patchFileSrc, patchFileDest);

// --------------------------------------------------------------------------------------//
//                                  Build using turbo                                   //
// --------------------------------------------------------------------------------------//
const buildArgs = ['turbo', 'run', 'build', `--filter=${SERVER_APP_NAME}`];
spawnSync(npxCommand, buildArgs, {
	cwd: MONOREPO_ROOT_DIR,
	stdio: 'inherit',
	shell: true,
});

// ! if not using turbo build
// // --------------------------------------------------------------------------------------//
// //                                   build the server                                    //
// // --------------------------------------------------------------------------------------//
// const buildArgsServer = ['build', `--filter=${SERVER_APP_NAME}`];
// spawnSync(bunCommand, buildArgsServer, { cwd: MONOREPO_ROOT_DIR, stdio: 'inherit', shell: true });

// // --------------------------------------------------------------------------------------//
// //                                   build the front                                    //
// // -------------------------------------------------------------------------------------//
// const buildArgsFront = ['build', `--filter=${FRONT_APP_NAME}`];
// spawnSync(bunCommand, buildArgsFront, { cwd: MONOREPO_ROOT_DIR, stdio: 'inherit', shell: true });

// --------------------------------------------------------------------------------------//
//                                   copy the builds                                     //
// --------------------------------------------------------------------------------------//
// copy the server build
const serverBuildDirName = 'dist';
const serverBuildSrc = path.join(SERVER_APP_DIR_SRC, serverBuildDirName);
const serverBuildDest = path.join(SERVER_APP_DIR_DEST, serverBuildDirName);
fse.copySync(serverBuildSrc, serverBuildDest);

// copy the front builds
const frontBuildDirName = 'build';
const frontBuildSrc = path.join(FRONT_APP_DIR_SRC, frontBuildDirName);
const frontBuildDest = path.join(FRONT_APP_DIR_DEST, frontBuildDirName);
fse.copySync(frontBuildSrc, frontBuildDest);

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
_.forEach(subdirectories, (subdirectory) => {
	const sourcePath = path.join(PACKAGES_DIR_SRC, subdirectory, 'package.json');
	const destPath = path.join(PACKAGES_DIR_DEST, subdirectory, 'package.json');
	fse.copySync(sourcePath, destPath);
});

// --------------------------------------------------------------------------------------//
//                                  set start command                                    //
// --------------------------------------------------------------------------------------//
const mainFile = path.relative(
	MONOREPO_ROOT_DIR,
	path.join(SERVER_APP_DIR_SRC, serverBuildDirName, 'index.mjs'),
);
// console.log(mainFile);
const START_SCRIPT = `bun --enable-source-maps ./${mainFile.replace(/\\/g, '/')}`;
const args = ['pkg', 'set', `scripts.start="${START_SCRIPT}"`];
spawnSync(bunCommand, args, {
	cwd: path.join(DEPLOY_ROOT_DIR),
	stdio: 'inherit',
	shell: true,
});

// unset build command
const argsUnset = ['pkg', 'delete', 'scripts.build'];
spawnSync(bunCommand, argsUnset, {
	cwd: path.join(DEPLOY_ROOT_DIR),
	stdio: 'inherit',
	shell: true,
});

// unset husky prepare command
const argsUnset2 = ['pkg', 'delete', 'scripts.prepare'];
spawnSync(bunCommand, argsUnset2, {
	cwd: path.join(DEPLOY_ROOT_DIR),
	stdio: 'inherit',
	shell: true,
});
