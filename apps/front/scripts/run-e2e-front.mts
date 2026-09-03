#!/usr/bin/env node

import { spawn, spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
	computeEnv as computeComposeEnv,
	releasePortBand as releaseComposePortBand,
	type E2eComposeEnv,
} from './e2e-compose-env.mts';

const COMPOSE_FILE = 'apps/front/docker-compose.test.yml';
const PNPM_COMMAND = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';

/**
 * How a lifecycle command is handed to `spawn`. `shell` is part of the shape
 * and is always `false`: Node >=22.15 deprecates `spawn(command, args,
 * { shell: true })`, so a Windows batch launcher (which cannot be executed
 * directly) goes through an explicit command processor instead.
 */
export type SpawnLaunch = {
	file: string;
	args: string[];
	shell: false;
};

const WINDOWS_BATCH_PATTERN = /\.(?:cmd|bat)$/i;

/**
 * POSIX commands (and Windows `.exe`-style ones such as `docker`) spawn
 * directly; a Windows `.cmd`/`.bat` is routed through `cmd.exe /d /s /c`.
 * That command processor parses the fixed command, and every command and
 * argument reaching here is an internal lifecycle literal, never user input.
 */
export const resolveSpawnLaunch = (
	command: string,
	args: string[],
	platform: NodeJS.Platform = process.platform,
): SpawnLaunch => {
	if (platform === 'win32' && WINDOWS_BATCH_PATTERN.test(command)) {
		return {
			file: process.env.COMSPEC ?? 'cmd.exe',
			args: ['/d', '/s', '/c', command, ...args],
			shell: false,
		};
	}
	return { file: command, args: [...args], shell: false };
};

// Grace period between forwarding the signal to the child's process group and
// escalating to SIGKILL, mirroring `run-guarded.mts`: SIGKILL on the negative
// PGID so no descendant (compose, playwright, browsers) survives as an orphan.
const parsedGraceMs = Number(process.env.E2E_SIGNAL_GRACE_MS ?? '5000');
const SIGNAL_GRACE_MS =
	Number.isFinite(parsedGraceMs) && parsedGraceMs >= 0 ? parsedGraceMs : 5000;

const SIGNAL_EXIT_CODES = new Map<NodeJS.Signals, number>([
	['SIGINT', 130],
	['SIGTERM', 143],
]);

/**
 * Failure raised when the runner itself was signalled, carrying the
 * shell-convention exit code (128 + signal number) so the entrypoint exits
 * 130 for SIGINT and 143 for SIGTERM instead of a generic 1.
 */
export class E2ESignalAbortError extends Error {
	readonly signal: NodeJS.Signals;
	readonly exitCode: number;

	constructor(signal: NodeJS.Signals) {
		super(`front e2e aborted by ${signal}`);
		this.name = 'E2ESignalAbortError';
		this.signal = signal;
		this.exitCode = SIGNAL_EXIT_CODES.get(signal) ?? 1;
	}
}

export const isSignalAbortError = (
	error: unknown,
): error is E2ESignalAbortError => error instanceof E2ESignalAbortError;

export type RunCommand = (
	command: string,
	args: string[],
	env: NodeJS.ProcessEnv,
	abortSignal?: AbortSignal,
) => Promise<void>;

type RunE2EFrontDependencies = {
	computeEnv?: () => E2eComposeEnv;
	runCommand?: RunCommand;
	releasePortBand?: (lockPath: string) => boolean;
	writeError?: (message: string) => void;
};

const abortReasonSignal = (abortSignal: AbortSignal): NodeJS.Signals => {
	const reason: unknown = abortSignal.reason;
	return isSignalAbortError(reason) ? reason.signal : 'SIGTERM';
};

/** The graceful and forced `taskkill` argument vectors for one process tree. */
export type WindowsTaskkillPlan = {
	graceful: string[] | null;
	force: string[];
};

/**
 * The `taskkill` argument vectors used to end a Windows process tree, mirroring
 * `killApiChildGroup` in `packages/scripts-ts/src/review-api.ts`. `/T` walks the
 * real tree rooted at the PID (Windows has no process groups, and
 * `child.kill()` would end only `cmd.exe`, orphaning pnpm/playwright/browsers).
 * `/T` alone requests a normal termination; `/F` forces it. SIGKILL is already
 * an escalation, so it forces immediately and skips the graceful attempt.
 */
export const planWindowsTaskkill = (
	pid: number,
	signal: NodeJS.Signals,
): WindowsTaskkillPlan => {
	const target = String(pid);
	return {
		graceful: signal === 'SIGKILL' ? null : ['/PID', target, '/T'],
		force: ['/PID', target, '/T', '/F'],
	};
};

type SignalChildTreeDependencies = {
	platform?: NodeJS.Platform;
	runTaskkill?: (args: string[]) => { status: number | null } | null;
	killProcessGroup?: (pid: number, signal: NodeJS.Signals) => void;
};

/**
 * Signals the child's whole process tree: on POSIX via the process group
 * (`detached: true` makes the child its own group leader, so `kill(-pid)`
 * reaches every descendant), on Windows via `taskkill /T`.
 */
export const signalChildTree = (
	child: { pid?: number; kill: (signal: NodeJS.Signals) => boolean },
	signal: NodeJS.Signals,
	dependencies: SignalChildTreeDependencies = {},
): void => {
	const pid = child.pid;
	if (pid === undefined || pid <= 0) {
		return;
	}
	const platform = dependencies.platform ?? process.platform;
	const runTaskkill =
		dependencies.runTaskkill ??
		((args: string[]) => spawnSync('taskkill', args, { stdio: 'ignore' }));
	const killProcessGroup =
		dependencies.killProcessGroup ??
		((groupPid: number, groupSignal: NodeJS.Signals) => {
			process.kill(-groupPid, groupSignal);
		});
	try {
		if (platform === 'win32') {
			const plan = planWindowsTaskkill(pid, signal);
			const graceful =
				plan.graceful === null ? null : runTaskkill(plan.graceful);
			if (graceful === null || graceful.status !== 0) {
				runTaskkill(plan.force);
			}
			return;
		}
		killProcessGroup(pid, signal);
	} catch {
		// The child may already have exited; nothing left to signal.
	}
};

export const runCommand: RunCommand = async (
	command,
	args,
	env,
	abortSignal,
) => {
	if (abortSignal?.aborted === true) {
		throw new E2ESignalAbortError(abortReasonSignal(abortSignal));
	}

	await new Promise<void>((resolveCommand, rejectCommand) => {
		const launch = resolveSpawnLaunch(command, args);
		const child = spawn(launch.file, launch.args, {
			env,
			stdio: 'inherit',
			shell: launch.shell,
			// Own process group so an interrupt reaches the entire tree.
			detached: process.platform !== 'win32',
		});

		let escalation: NodeJS.Timeout | undefined;
		let abortedWith: NodeJS.Signals | undefined;

		const onAbort = () => {
			if (abortSignal === undefined || abortedWith !== undefined) {
				return;
			}
			abortedWith = abortReasonSignal(abortSignal);
			signalChildTree(child, abortedWith);
			// Bounded wait: if the tree ignores the forwarded signal, escalate.
			escalation = setTimeout(() => {
				signalChildTree(child, 'SIGKILL');
			}, SIGNAL_GRACE_MS);
			escalation.unref();
		};

		abortSignal?.addEventListener('abort', onAbort, { once: true });
		if (abortSignal?.aborted === true) {
			onAbort();
		}

		const cleanup = () => {
			if (escalation !== undefined) {
				clearTimeout(escalation);
			}
			abortSignal?.removeEventListener('abort', onAbort);
		};

		child.once('error', (error) => {
			cleanup();
			rejectCommand(error);
		});
		child.once('exit', (code, signal) => {
			cleanup();

			if (abortedWith !== undefined) {
				rejectCommand(new E2ESignalAbortError(abortedWith));
				return;
			}

			if (code === 0) {
				resolveCommand();
				return;
			}

			const outcome =
				signal === null ? `exit ${String(code)}` : `signal ${signal}`;
			rejectCommand(
				new Error(`${command} ${args.join(' ')} failed with ${outcome}`),
			);
		});
	});
};

const composeArgs = (...args: string[]): string[] => [
	'compose',
	'-f',
	COMPOSE_FILE,
	...args,
];

const playwrightArgs = (...args: string[]): string[] => [
	'--filter',
	'front',
	...args,
];

export const runE2EFront = async (
	dependencies: RunE2EFrontDependencies = {},
): Promise<void> => {
	const computeEnv = dependencies.computeEnv ?? computeComposeEnv;
	const execute = dependencies.runCommand ?? runCommand;
	const releasePortBand =
		dependencies.releasePortBand ?? releaseComposePortBand;
	const writeError =
		dependencies.writeError ??
		((message: string) => process.stderr.write(message));
	const derivedEnv = computeEnv();
	const commandEnv = { ...process.env, ...derivedEnv };
	let lifecyclePassed = false;

	// A received signal must not kill the runner outright: the default
	// disposition would skip the `finally` below, leaking the port-band lock
	// and orphaning the active child. Handle it, forward it, then reject.
	const abortController = new AbortController();
	const abortSignal = abortController.signal;
	const onSignal = (signal: NodeJS.Signals) => {
		if (!abortSignal.aborted) {
			abortController.abort(new E2ESignalAbortError(signal));
		}
	};
	const onSigint = () => onSignal('SIGINT');
	const onSigterm = () => onSignal('SIGTERM');
	process.on('SIGINT', onSigint);
	process.on('SIGTERM', onSigterm);

	const step = (command: string, args: string[]): Promise<void> =>
		execute(command, args, commandEnv, abortSignal);

	try {
		await step('docker', composeArgs('down', '-v', '--remove-orphans'));
		await step(
			'docker',
			composeArgs('up', '-d', '--build', '--wait', '--wait-timeout', '180'),
		);
		await step(
			PNPM_COMMAND,
			playwrightArgs('exec', 'playwright', 'install', 'chromium'),
		);
		await step(PNPM_COMMAND, playwrightArgs('exec', 'playwright', 'test'));
		await step(PNPM_COMMAND, playwrightArgs('test:drawer-contrast'));
		lifecyclePassed = true;
	} finally {
		process.removeListener('SIGINT', onSigint);
		process.removeListener('SIGTERM', onSigterm);
		try {
			if (lifecyclePassed) {
				await execute('docker', composeArgs('down', '-v'), commandEnv);
			} else {
				writeError('E2E stack left running for inspection after failure.\n');
			}
		} finally {
			releasePortBand(derivedEnv.E2E_LOCK_PATH);
		}
	}
};

const isMainModule = (): boolean => {
	const entryPath = process.argv[1];
	return (
		entryPath !== undefined &&
		fileURLToPath(import.meta.url) === resolve(entryPath)
	);
};

if (isMainModule()) {
	process.stdout.write('=== [gate] front e2e (docker + playwright) ===\n');
	try {
		await runE2EFront();
	} catch (error) {
		// A failed sub-command must surface as a plain message plus a non-zero
		// exit code, not as an unhandled-rejection stack trace. An interrupted
		// run reports the shell-convention code instead (130 SIGINT, 143 SIGTERM).
		process.stderr.write(
			`${error instanceof Error ? error.message : String(error)}\n`,
		);
		process.exitCode = isSignalAbortError(error) ? error.exitCode : 1;
	}
}
