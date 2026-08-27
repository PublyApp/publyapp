import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const DEFAULT_REF = 'origin/develop';
const IMAGE_ROOT = 'ghcr.io/publyapp/publyapp';

const usage = `Usage: scripts/deploy-images.mjs [--no-push] [--dry-run] [REF]

Build the API, migrator, and front deploy images from a pristine worktree of REF.

Arguments:
  REF        Git ref to build (default: origin/develop)

Options:
  --no-push  Build images locally without checking GHCR auth or pushing
  --dry-run  Print the commands that would run without changing anything
  -h, --help Show this help

Environment:
  DEPLOY_IMAGES_NO_PUSH=1  Same as --no-push`;

class RuntimeError extends Error {}

// @ts-expect-error rung-0: add proper type in later rung
const progress = (message) => {
	process.stdout.write(`==> ${message}\n`);
};

const printUsage = (stream = process.stdout) => {
	stream.write(`${usage}\n`);
};

// @ts-expect-error rung-0: add proper type in later rung
const formatArgument = (argument) => {
	if (argument.length > 0 && !/[\s"']/.test(argument)) {
		return argument;
	}

	return JSON.stringify(argument);
};

// @ts-expect-error rung-0: add proper type in later rung
const formatCommand = (command, args) => {
	return [command, ...args].map(formatArgument).join(' ');
};

// @ts-expect-error rung-0: add proper type in later rung
const runCommand = (command, args, { announce = false } = {}) => {
	if (announce) {
		progress(formatCommand(command, args));
	}

	const result = spawnSync(command, args, { stdio: 'inherit' });
	if (result.error) {
		throw new RuntimeError(
			`Could not run ${formatCommand(command, args)}: ${result.error.message}`,
		);
	}

	if (result.status !== 0) {
		throw new RuntimeError(
			`Command failed with exit code ${result.status}: ${formatCommand(command, args)}`,
		);
	}
};

// @ts-expect-error rung-0: add proper type in later rung
const captureCommand = (command, args) => {
	const result = spawnSync(command, args, { encoding: 'utf8' });
	if (result.error || result.status !== 0) {
		return null;
	}

	return result.stdout.trim();
};

// @ts-expect-error rung-0: add proper type in later rung
const parseArguments = (args) => {
	let ref = DEFAULT_REF;
	let refSet = false;
	let noPush = process.env.DEPLOY_IMAGES_NO_PUSH === '1';
	let dryRun = false;

	for (const argument of args) {
		if (argument === '--no-push') {
			noPush = true;
		} else if (argument === '--dry-run') {
			dryRun = true;
		} else if (argument === '-h' || argument === '--help') {
			return { help: true };
		} else if (argument.startsWith('--')) {
			process.stderr.write(`Unknown option: ${argument}\n`);
			// @ts-expect-error rung-0: TS2345
			printUsage(process.stderr);
			return { exitCode: 2 };
		} else if (refSet) {
			process.stderr.write('Only one git ref may be provided.\n');
			// @ts-expect-error rung-0: TS2345
			printUsage(process.stderr);
			return { exitCode: 2 };
		} else {
			ref = argument;
			refSet = true;
		}
	}

	return { dryRun, noPush, ref };
};

const hasGhcrAuth = () => {
	const dockerConfigDirectory =
		process.env.DOCKER_CONFIG || path.join(homedir(), '.docker');
	const configPath = path.join(dockerConfigDirectory, 'config.json');

	if (!existsSync(configPath)) {
		return false;
	}

	const contents = readFileSync(configPath, 'utf8');
	try {
		const config = JSON.parse(contents);
		return Boolean(
			config &&
			typeof config === 'object' &&
			((config.auths &&
				typeof config.auths === 'object' &&
				Object.hasOwn(config.auths, 'ghcr.io')) ||
				(config.credHelpers &&
					typeof config.credHelpers === 'object' &&
					Object.hasOwn(config.credHelpers, 'ghcr.io'))),
		);
	} catch {
		return contents.includes('ghcr.io');
	}
};

// @ts-expect-error rung-0: add proper type in later rung
const getBuildCommands = (context, sha) => {
	const apiDockerfile = path.join(context, 'apps', 'api', 'Dockerfile');
	const frontDockerfile = path.join(context, 'apps', 'front', 'Dockerfile');

	return [
		[
			'docker',
			[
				'buildx',
				'build',
				'--load',
				'--platform',
				'linux/amd64',
				'-f',
				apiDockerfile,
				'--target',
				'runtime',
				'-t',
				`${IMAGE_ROOT}/api:${sha}`,
				context,
			],
		],
		[
			'docker',
			[
				'buildx',
				'build',
				'--load',
				'--platform',
				'linux/amd64',
				'-f',
				apiDockerfile,
				'--target',
				'migrate',
				'-t',
				`${IMAGE_ROOT}/migrate:${sha}`,
				context,
			],
		],
		[
			'docker',
			[
				'buildx',
				'build',
				'--load',
				'--platform',
				'linux/amd64',
				'-f',
				frontDockerfile,
				'-t',
				`${IMAGE_ROOT}/front:${sha}`,
				context,
			],
		],
	];
};

// @ts-expect-error rung-0: add proper type in later rung
const getPushCommands = (sha) => {
	return ['api', 'migrate', 'front'].map((image) => [
		'docker',
		['push', `${IMAGE_ROOT}/${image}:${sha}`],
	]);
};

// @ts-expect-error rung-0: add proper type in later rung
const getWorktreeContext = (sha) => {
	const commonDirectory = captureCommand('git', [
		'rev-parse',
		'--path-format=absolute',
		'--git-common-dir',
	]);
	if (!commonDirectory) {
		throw new RuntimeError('Could not locate the repository git directory.');
	}

	const worktreesDirectory = path.join(
		path.dirname(commonDirectory),
		'.worktrees',
	);
	const expectedName = `deploy-build-${sha.slice(0, 12)}`;
	const context = path.join(worktreesDirectory, expectedName);
	if (
		path.dirname(context) !== worktreesDirectory ||
		path.basename(context) !== expectedName
	) {
		throw new RuntimeError(`Refusing unsafe build worktree path: ${context}`);
	}

	return context;
};

// @ts-expect-error rung-0: add proper type in later rung
const isRegisteredWorktree = (context) => {
	const worktreeList = captureCommand('git', [
		'worktree',
		'list',
		'--porcelain',
	]);
	if (!worktreeList) {
		throw new RuntimeError('Could not inspect existing git worktrees.');
	}

	// @ts-expect-error rung-0: add proper type in later rung
	const normalizePath = (candidate) => {
		const resolved = path.resolve(candidate);
		if (process.platform === 'win32') {
			return resolved.toLowerCase();
		}
		return resolved;
	};
	const normalizedContext = normalizePath(context);
	return worktreeList
		.split(/\r?\n/)
		.filter((line) => line.startsWith('worktree '))
		.some((line) => {
			return (
				normalizePath(line.slice('worktree '.length)) === normalizedContext
			);
		});
};

// @ts-expect-error rung-0: add proper type in later rung
const printReleaseInstructions = (sha) => {
	process.stdout.write(`RELEASE_TAG=${sha}\n`);
	process.stdout.write(
		'Next: set RELEASE_TAG in Dokploy -> Environment, then redeploy.\n',
	);
};

const main = () => {
	const options = parseArguments(process.argv.slice(2));
	if (options.help) {
		printUsage();
		return 0;
	}

	if (options.exitCode) {
		return options.exitCode;
	}

	const sha = captureCommand('git', ['rev-parse', options.ref]);
	if (!sha) {
		process.stderr.write(`Could not resolve git ref: ${options.ref}\n`);
		return 1;
	}

	if (!/^[0-9a-f]{40}$/i.test(sha)) {
		process.stderr.write(
			`Git ref ${options.ref} did not resolve to a full 40-character SHA: ${sha}\n`,
		);
		return 1;
	}

	progress(`Resolved ${options.ref} to ${sha}`);

	try {
		const context = getWorktreeContext(sha);
		const addCommand = ['git', ['worktree', 'add', '--detach', context, sha]];
		const removeCommand = ['git', ['worktree', 'remove', '--force', context]];
		const buildCommands = getBuildCommands(context, sha);
		const pushCommands = options.noPush ? [] : getPushCommands(sha);

		if (options.dryRun) {
			for (const [command, args] of [
				addCommand,
				...buildCommands,
				...pushCommands,
				removeCommand,
			]) {
				progress(formatCommand(command, args));
			}
			printReleaseInstructions(sha);
			return 0;
		}

		progress('Checking Docker Buildx');
		try {
			runCommand('docker', ['buildx', 'version']);
		} catch {
			throw new RuntimeError(
				'Docker Buildx is required. Ensure Docker is running and buildx is installed.',
			);
		}

		if (!options.noPush && !hasGhcrAuth()) {
			throw new RuntimeError(
				'Not logged into GHCR. Run: docker login ghcr.io -u <your-github-username>',
			);
		}

		let operationError = null;
		try {
			if (isRegisteredWorktree(context)) {
				progress('Removing stale deploy build worktree');
				// @ts-expect-error rung-0: TS2556
				runCommand(...removeCommand);
			}
			if (existsSync(context)) {
				progress('Removing stale unregistered deploy build directory');
				rmSync(context, { force: true, recursive: true });
			}

			progress(`Creating pristine source worktree at ${sha}`);
			// @ts-expect-error rung-0: TS2556
			runCommand(...addCommand);

			const buildLabels = [
				'Building API runtime image',
				'Building API migrate image',
				'Building front image',
			];
			for (const [index, command] of buildCommands.entries()) {
				progress(buildLabels[index]);
				// @ts-expect-error rung-0: TS2556
				runCommand(...command);
			}

			const pushLabels = [
				'Pushing API image',
				'Pushing migrate image',
				'Pushing front image',
			];
			for (const [index, command] of pushCommands.entries()) {
				progress(pushLabels[index]);
				// @ts-expect-error rung-0: TS2556
				runCommand(...command);
			}
		} catch (error) {
			operationError = error;
		} finally {
			progress('Removing deploy build worktree');
			// @ts-expect-error rung-0: TS2769
			const cleanup = spawnSync(removeCommand[0], removeCommand[1], {
				stdio: 'inherit',
			});
			if (cleanup.error || cleanup.status !== 0) {
				const cleanupError = `Could not remove deploy build worktree: ${context}`;
				if (operationError) {
					process.stderr.write(`Cleanup also failed. ${cleanupError}\n`);
				} else {
					operationError = new RuntimeError(cleanupError);
				}
			}
		}

		if (operationError) {
			throw operationError;
		}

		printReleaseInstructions(sha);
		return 0;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		process.stderr.write(`${message}\n`);
		return 1;
	}
};

process.exitCode = main();
