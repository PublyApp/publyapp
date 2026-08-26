#!/usr/bin/env node

// Frontend review launcher (#1020): keeps only the app-specific parts — the API
// prerequisite, dependency install, Vite launch command and readiness check, and the
// user-facing messages. Everything application-neutral (command execution with
// secret-aware rendering, worktree discovery/root resolution, GitHub execution, port
// probing, env-file copying, tracked-file checks, interactive selection, resolution
// error handling, child signal handling, startup/exit plumbing) lives in
// review-launcher.ts and is tested there.

import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
	err,
	ensureEnvCopy,
	ensurePortOpen,
	forwardTerminationSignals,
	parseLauncherArgs,
	requireResolvedWorktree,
	reportNewlyDirtyFiles,
	resolveReviewTarget,
	runCommand,
	runLauncherCli,
	trackedChanges,
} from './review-launcher.ts';

const DEFAULT_PORT = 5050;
const FRONTEND_ENV_FILE = '.env.development';
const requestedArgs = process.argv.slice(2);

// @ts-expect-error rung-0: add proper type in later rung
const parseArgs = (args) =>
	parseLauncherArgs(args, { defaultPort: DEFAULT_PORT });

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

// @ts-expect-error rung-0: add proper type in later rung
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
		'guards',
		'assert-pinned.mts',
	);

	if (existsSync(worktreeFrontNodeModules)) {
		console.log('Dependency check: front dependencies already installed.');
		return;
	}

	console.log('Checking pinned deps in worktree...');

	if (existsSync(assertPinnedPath)) {
		runCommand('node', ['apps/front/scripts/guards/assert-pinned.mts'], {
			cwd: worktreePath,
			stdio: 'inherit',
			timeout: 10 * 60_000,
		});
	} else {
		console.error(
			'Skipping assert-pinned check (missing target script): apps/front/scripts/guards/assert-pinned.mts',
		);
	}

	console.log('Installing front deps (frozen, no scripts)...');
	runCommand('pnpm', ['install', '--frozen-lockfile', '--ignore-scripts'], {
		cwd: worktreePath,
		stdio: 'inherit',
		timeout: 10 * 60_000,
	});

	if (existsSync(sharedTsPostinstall)) {
		console.log('Running shared-ts postinstall...');
		runCommand('pnpm', ['--filter', '@org/shared-ts', 'run', 'postinstall'], {
			cwd: worktreePath,
			stdio: 'inherit',
			timeout: 10 * 60_000,
		});
	} else {
		console.error(
			'Skipping shared-ts postinstall (missing packages/shared-ts/package.json)',
		);
	}
};

// @ts-expect-error rung-0: add proper type in later rung
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

// @ts-expect-error rung-0: add proper type in later rung
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

	forwardTerminationSignals(
		// @ts-expect-error rung-0: TS7006 - signal stays untyped until a later rung
		(signal) => {
			if (!child.killed) {
				child.kill(signal);
			}
		},
	);

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
	const resolved = await resolveReviewTarget({ requestedRef });
	const worktree = requireResolvedWorktree(resolved, requestedRef);

	await ensurePortOpen(port, {
		// @ts-expect-error rung-0: TS2353 - `what` is open-ended until a later rung types it
		what: 'frontend',
	});
	await ensureApi();
	await ensureDependencies(worktree.path);
	ensureEnvCopy(worktree.path, FRONTEND_ENV_FILE);

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
	reportNewlyDirtyFiles(beforeDirty, afterDirty);

	if (signal) {
		process.exit(0);
	}

	if (code !== 0) {
		err(`Vite exited with code ${String(code)}.`);
	}
};

await runLauncherCli(main, fileURLToPath(import.meta.url));
