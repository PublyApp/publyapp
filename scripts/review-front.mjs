#!/usr/bin/env node

import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { copyFileSync, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:net';
import path from 'node:path';
import process from 'node:process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

import {
	GH_AUTH_FAILURE,
	GH_INVOCATION_FAILURE,
	GH_NETWORK_FAILURE,
	parseWorktrees,
	parseTrackedChangesFromStatus,
	getBranchPathByMap,
	resolveTarget,
	runIssueByNumber,
	runPrByNumber,
} from './review-worktree.resolve.mjs';

const DEFAULT_PORT = 5050;
const FRONTEND_ENV_FILE = '.env.development';
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const rootRepoCache = { path: null };
const requestedArgs = process.argv.slice(2);
const hasInteractiveTerminal = process.stdin.isTTY && process.stdout.isTTY;

const err = (message) => {
	console.error(message);
	process.exit(1);
};

const runCommand = (command, args, options = {}) => {
	const result = spawnSync(command, args, {
		cwd: options.cwd,
		env: { ...process.env, ...(options.env ?? {}) },
		encoding: 'utf8',
		stdio: options.stdio ?? 'pipe',
	});

	if (result.error) {
		throw result.error;
	}

	const status = result.status ?? -1;
	if (status !== 0) {
		const stderr = String(result.stderr ?? '').trim();
		const stdout = String(result.stdout ?? '').trim();
		const prefix = options.label ? `${options.label}: ` : '';
		throw new Error(
			`${prefix}${command} ${args.join(' ')} exited with status ${String(status)} ` +
				`${stderr || stdout ? `\n${stderr || stdout}` : ''}`,
		);
	}

	return {
		stdout: String(result.stdout ?? ''),
		stderr: String(result.stderr ?? ''),
		status,
	};
};

const runCommandOptional = (command, args, options = {}) => {
	try {
		return runCommand(command, args, options);
	} catch (error) {
		return {
			status: -1,
			stdout: '',
			stderr: String(error?.message ?? ''),
			error,
		};
	}
};

const parseArgs = (args) => {
	let requestedRef = '';
	let port = DEFAULT_PORT;

	for (let index = 0; index < args.length; index += 1) {
		const argument = args[index];
		if (argument === '--port') {
			const requestedPort = args[index + 1];
			if (!requestedPort) {
				err('Missing value for --port.');
			}

			index += 1;
			const parsed = Number.parseInt(requestedPort, 10);
			if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65_535) {
				err(`Invalid --port value: ${requestedPort}.`);
			}

			port = parsed;
			continue;
		}

		if (argument.startsWith('--port=')) {
			const requestedPort = argument.slice('--port='.length);
			const parsed = Number.parseInt(requestedPort, 10);
			if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65_535) {
				err(`Invalid --port value: ${requestedPort}.`);
			}

			port = parsed;
			continue;
		}

		if (requestedRef.length === 0) {
			requestedRef = argument;
			continue;
		}

		if (argument.startsWith('--')) {
			err(`Unknown option: ${argument}`);
		}
	}

	return { requestedRef, port };
};

const getWorktrees = () => {
	const output = runCommand('git', ['worktree', 'list', '--porcelain'], {
		cwd: repoRoot,
	}).stdout;

	return parseWorktrees(output);
};

const getRootClonePath = () => {
	if (rootRepoCache.path) {
		return rootRepoCache.path;
	}

	const result = runCommand(
		'git',
		['rev-parse', '--path-format=absolute', '--git-common-dir'],
		{ cwd: repoRoot },
	);
	const gitCommonDir = result.stdout.trim();
	if (!gitCommonDir) {
		rootRepoCache.path = repoRoot;
		return rootRepoCache.path;
	}

	const commonDir = path.resolve(gitCommonDir);
	rootRepoCache.path = path.resolve(commonDir, '..');
	return rootRepoCache.path;
};

const ensureApi = async () => {
	for (let attempt = 0; attempt < 6; attempt += 1) {
		try {
			const response = await fetch('http://127.0.0.1:5000/health', {
				signal: AbortSignal.timeout(1000),
			});

			if (response.ok) {
				return;
			}
		} catch {
			// Keep retrying while API comes up.
		}

		await new Promise((resolve) => {
			setTimeout(resolve, 1000);
		});
	}

	throw new Error(
		[
			'API on :5000 is not answering. Start it with:',
			'  just dev-db',
			'  just dev-api',
		].join('\n'),
	);
};

const ensureDependencies = (worktreePath) => {
	const worktreeFrontNodeModules = path.join(
		worktreePath,
		'apps',
		'front',
		'node_modules',
	);
	const sharedTsPostinstall = path.join(
		worktreePath,
		'packages',
		'shared-ts',
		'package.json',
	);
	const assertPinnedPath = path.join(
		worktreePath,
		'apps',
		'front',
		'scripts',
		'assert-pinned.mjs',
	);

	if (existsSync(worktreeFrontNodeModules)) {
		console.log('Dependency check: front dependencies already installed.');
		return;
	}

	console.log('Checking pinned deps in worktree...');

	if (existsSync(assertPinnedPath)) {
		runCommand('node', ['apps/front/scripts/assert-pinned.mjs'], {
			cwd: worktreePath,
			stdio: 'inherit',
		});
	} else {
		console.error(
			'Skipping assert-pinned check (missing target script): apps/front/scripts/assert-pinned.mjs',
		);
	}

	console.log('Installing front deps (frozen, no scripts)...');
	runCommand('pnpm', ['install', '--frozen-lockfile', '--ignore-scripts'], {
		cwd: worktreePath,
		stdio: 'inherit',
	});

	if (existsSync(sharedTsPostinstall)) {
		console.log('Running shared-ts postinstall...');
		runCommand('pnpm', ['--filter', '@org/shared-ts', 'run', 'postinstall'], {
			cwd: worktreePath,
			stdio: 'inherit',
		});
	} else {
		console.error(
			'Skipping shared-ts postinstall (missing packages/shared-ts/package.json)',
		);
	}
};

const isPortAvailableOnHost = async (host, port) => {
	return await new Promise((resolve) => {
		const server = createServer();
		server.once('error', () => {
			resolve(false);
		});
		server.listen(port, host, () => {
			server.close(() => {
				resolve(true);
			});
		});
	});
};

const ensurePortOpen = async (port, { host = '127.0.0.1' } = {}) => {
	const available = await isPortAvailableOnHost(host, port);
	if (!available) {
		err(
			`Port ${String(
				port,
			)} is already in use. The root clone's frontend or another review launcher is likely running.\n` +
				'Stop that process, or run with --port <n> to force a different port.',
		);
	}
};

const isHardlinkToSource = (source, destination) => {
	const sourceStats = statSync(source);
	const destinationStats = statSync(destination);
	if (
		destinationStats.dev === sourceStats.dev &&
		destinationStats.ino === sourceStats.ino
	) {
		return true;
	}

	return destinationStats.nlink > 1;
};

const ensureEnvCopy = (worktreePath) => {
	const source = path.join(getRootClonePath(), FRONTEND_ENV_FILE);
	const target = path.join(worktreePath, FRONTEND_ENV_FILE);

	if (!existsSync(source)) {
		err(
			`Missing ${source}; copy .env.example to .env.development in the root clone before continuing.`,
		);
	}

	if (!existsSync(target)) {
		copyFileSync(source, target);
		console.log(`Copied ${source} -> ${target}.`);
		return;
	}

	if (isHardlinkToSource(source, target)) {
		err(
			`Refusing to proceed: ${target} is linked to ${source}. ` +
				'Copying would rewrite the root clone file. Use a standalone worktree env file.',
		);
	}

	console.log(`Using existing ${target}; leaving it unchanged.`);
};

const trackedChanges = (worktreePath) => {
	const output = runCommand(
		'git',
		['-C', worktreePath, 'status', '--short', '--untracked-files=no'],
		{
			stdio: 'pipe',
		},
	).stdout;

	return parseTrackedChangesFromStatus(output);
};

const waitForFrontendReachable = async (url) => {
	for (let attempt = 0; attempt < 60; attempt += 1) {
		try {
			await fetch(url, {
				signal: AbortSignal.timeout(1000),
			});
			return;
		} catch {
			await new Promise((resolve) => {
				setTimeout(resolve, 250);
			});
		}
	}

	err(`Vite did not become reachable at ${url} before timeout.`);
};

const askChoice = async (title, rows) => {
	console.log(title);
	rows.forEach((row, index) => {
		console.log(`${index + 1}. ${row}`);
	});

	if (!hasInteractiveTerminal) {
		err('Interactive selection required but terminal is not interactive.');
	}

	const rl = createInterface({
		input: process.stdin,
		output: process.stdout,
	});

	const selected = await new Promise((resolve) => {
		rl.question(`Select 1-${rows.length}: `, (input) => {
			rl.close();
			resolve(input.trim());
		});
	});

	const index = Number.parseInt(selected, 10);
	if (!Number.isInteger(index) || index < 1 || index > rows.length) {
		err(`Invalid selection: ${selected}`);
	}

	return index - 1;
};

const launchVite = async (worktreePath, port, { host = '127.0.0.1' } = {}) => {
	const cwd = path.join(worktreePath, 'apps', 'front');
	const publicUrl = `http://${host}:${port}`;
	const child = spawn(
		'pnpm',
		[
			'exec',
			'vite',
			'dev',
			'--host',
			host,
			'--port',
			String(port),
			'--strictPort',
		],
		{
			cwd,
			stdio: 'inherit',
			env: { ...process.env },
		},
	);

	const shutdown = (signal) => {
		if (!child.killed) {
			child.kill(signal);
		}
	};
	process.on('SIGINT', () => shutdown('SIGINT'));
	process.on('SIGTERM', () => shutdown('SIGTERM'));

	await waitForFrontendReachable(publicUrl);
	const [code, signal] = await once(child, 'exit');

	if (signal) {
		console.log(`Vite exited on ${signal}.`);
		return { signal };
	}

	return { code };
};

const main = async () => {
	const { requestedRef, port } = parseArgs(requestedArgs);
	const worktrees = getWorktrees();
	const byBranch = getBranchPathByMap(worktrees);
	const runGh = async (args) =>
		runCommandOptional('gh', args, {
			cwd: repoRoot,
			label: 'gh',
		});

	const resolved = await resolveTarget(worktrees, byBranch, {
		requestedRef,
		hasInteractiveTerminal,
		askChoice,
		runPrByNumber: (number) => runPrByNumber(number, { runGh }),
		runIssueByNumber: (number) => runIssueByNumber(number, { runGh }),
		runGh,
	});

	const worktree = resolved?.worktree;
	if (!worktree?.path) {
		if (resolved?.kind === 'not-found') {
			err(
				`No PR or issue found for ${String(
					resolved.requested,
				)}. Add this PR to a local worktree first.`,
			);
		}

		if (resolved?.kind === 'issue-ambiguous') {
			const candidates = resolved.worktrees.map((w) => w.path).join('\n  ');
			err(
				`Issue ${String(
					resolved.requested,
				)} matched multiple worktrees; pick the target directly by PR number or by path.\n  ${candidates}`,
			);
		}

		if (resolved?.kind === 'pr-unmatched') {
			err(`Could not resolve PR #${resolved.requested} to a local worktree.`);
		}

		err(`Could not determine worktree for ${String(requestedRef)}.`);
	}

	await ensurePortOpen(port);
	await ensureApi();
	await ensureDependencies(worktree.path);
	ensureEnvCopy(worktree.path);

	console.log('\n');
	console.log('Launching PR frontend review server');
	console.log(`worktree: ${worktree.path}`);
	console.log(`open:     http://localhost:${String(port)}`);
	console.log(
		`Tip: keep a second terminal for API/debug while both sessions run.`,
	);
	console.log('');

	const beforeDirty = trackedChanges(worktree.path);
	const { code, signal } = await launchVite(worktree.path, port);
	const afterDirty = trackedChanges(worktree.path);
	const newlyDirty = [...afterDirty].filter((entry) => !beforeDirty.has(entry));

	if (newlyDirty.length > 0) {
		console.error('Warning: tracked files became dirty while the session ran.');
		for (const entry of newlyDirty) {
			console.error(`  ${entry}`);
		}
	}

	if (signal) {
		process.exit(0);
	}

	if (code !== 0) {
		err(`Vite exited with code ${String(code)}.`);
	}
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	try {
		await main();
	} catch (error) {
		switch (error?.code) {
			case GH_AUTH_FAILURE: {
				err(`${error.message}\nRun: gh auth login`);
				break;
			}

			case GH_NETWORK_FAILURE:
			case GH_INVOCATION_FAILURE: {
				err(error.message);
				break;
			}

			default: {
				err(error?.message ?? String(error));
			}
		}
	}
}
