#!/usr/bin/env node

import { spawn, spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
	reserveE2EComposeEnv,
	type E2eComposeReservation,
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
	reserveEnv?: (abortSignal: AbortSignal) => Promise<E2eComposeReservation>;
	runCommand?: RunCommand;
	writeError?: (message: string) => void;
};

const describeError = (error: unknown): string =>
	error instanceof Error ? error.message : String(error);

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

/** Whether a POSIX process group still has a member after its leader exits. */
const processGroupStillExists = (pid: number | undefined): boolean => {
	if (process.platform === 'win32' || pid === undefined || pid <= 0) {
		return true;
	}
	try {
		process.kill(-pid, 0);
		return true;
	} catch (error) {
		// Only ESRCH proves the group disappeared; EPERM and every other
		// failure leave uncertainty, so the fail-closed escalation stays armed.
		return (error as NodeJS.ErrnoException).code !== 'ESRCH';
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
				cleanup(false);
				rejectCommand(new E2ESignalAbortError(abortReasonSignal(abortSignal)));
			}, SIGNAL_GRACE_MS);
		};

		abortSignal?.addEventListener('abort', onAbort, { once: true });
		if (abortSignal?.aborted === true) {
			onAbort();
		}

		const cleanup = (clearEscalation = true) => {
			if (clearEscalation && escalation !== undefined) {
				clearTimeout(escalation);
			}
			abortSignal?.removeEventListener('abort', onAbort);
		};

		child.once('error', (error) => {
			if (abortedWith !== undefined) {
				return;
			}
			cleanup();
			rejectCommand(error);
		});
		child.once('exit', (code, signal) => {
			if (abortedWith !== undefined) {
				// The direct child can exit before a TERM-resistant descendant.
				// Keep the referenced escalation timer alive until it sends SIGKILL to
				// the whole group, unless a POSIX group probe proves it is gone.
				if (processGroupStillExists(child.pid)) {
					return;
				}
				cleanup();
				rejectCommand(new E2ESignalAbortError(abortedWith));
				return;
			}
			cleanup();

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

export type PlaywrightTestSelection = {
	spec?: string;
	grep?: string;
	project?: string;
};

export const resolvePlaywrightTestArgs = ({
	spec,
	grep,
	project,
}: PlaywrightTestSelection): string[] => {
	const args = ['exec', 'playwright', 'test'];
	if (spec !== undefined) {
		args.push(spec);
	}
	if (grep !== undefined) {
		args.push('--grep', grep);
	}
	if (project !== undefined) {
		args.push('--project', project);
	}
	return args;
};

export const runE2EFront = async (
	dependencies: RunE2EFrontDependencies = {},
): Promise<void> => {
	const reserveEnv =
		dependencies.reserveEnv ??
		((abortSignal: AbortSignal) => reserveE2EComposeEnv(abortSignal));
	const execute = dependencies.runCommand ?? runCommand;
	const writeError =
		dependencies.writeError ??
		((message: string) => process.stderr.write(message));

	// A received signal must not kill the runner outright: the default
	// disposition would skip the cleanup below, orphaning the active child and
	// the acquisition in flight. The handlers are therefore installed BEFORE
	// the reservation is awaited — the lease scan is itself an interruptible
	// window, and a signal landing inside it must reach the helper's abort
	// path rather than the process's default one.
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

	let reservation: E2eComposeReservation | undefined;
	let lifecycleError: unknown;

	try {
		reservation = await reserveEnv(abortSignal);
		const commandEnv = { ...process.env, ...reservation.env };
		const step = (command: string, args: string[]): Promise<void> =>
			execute(command, args, commandEnv, abortSignal);

		await step('docker', composeArgs('down', '-v', '--remove-orphans'));
		await step(
			'docker',
			composeArgs('up', '-d', '--build', '--wait', '--wait-timeout', '180'),
		);
		await step(
			PNPM_COMMAND,
			playwrightArgs('exec', 'playwright', 'install', 'chromium'),
		);
		await step(
			PNPM_COMMAND,
			playwrightArgs(
				...resolvePlaywrightTestArgs({
					spec: process.env.E2E_PLAYWRIGHT_SPEC,
					grep: process.env.E2E_PLAYWRIGHT_GREP,
					project: process.env.E2E_PLAYWRIGHT_PROJECT,
				}),
			),
		);
		await step(PNPM_COMMAND, playwrightArgs('test:drawer-contrast'));
	} catch (error) {
		lifecycleError = error;
	}
	if (lifecycleError === undefined && abortSignal.aborted) {
		lifecycleError = abortSignal.reason;
	}

	// A failed acquisition owns nothing: there is no stack to tear down and no
	// lease to release, so the runner reports the failure and stops.
	if (reservation === undefined) {
		process.removeListener('SIGINT', onSigint);
		process.removeListener('SIGTERM', onSigterm);
		throw lifecycleError;
	}

	// The stack is torn down on EVERY outcome — success, ordinary failure, and
	// signal alike. Leaving it up on failure looked like a debugging courtesy,
	// but it strands containers and holds the band's ports, so the next run of
	// this tree collides with the corpse of the previous one.
	//
	// The signal handlers stay installed for this teardown. Removing them here
	// would restore the default disposition, and a Ctrl-C arriving mid-cleanup
	// would kill the runner outright: teardown orphaned, lease stranded until
	// the process died anyway. Instead a signal during cleanup is recorded
	// (latching the exit code the caller asked for) and the cleanup finishes.
	let cleanupSignal: NodeJS.Signals | undefined;
	const onCleanupSignal = (signal: NodeJS.Signals) => {
		cleanupSignal ??= signal;
		writeError(
			`Received ${signal} during cleanup; finishing teardown before exiting.\n`,
		);
	};

	process.removeListener('SIGINT', onSigint);
	process.removeListener('SIGTERM', onSigterm);
	process.on('SIGINT', onCleanupSignal);
	process.on('SIGTERM', onCleanupSignal);

	let cleanupError: unknown;
	let releaseError: unknown;
	try {
		// Deliberately NOT passed `abortSignal`: it is already aborted after a
		// signalled run, and an aborted teardown is no teardown at all.
		await execute('docker', composeArgs('down', '-v', '--remove-orphans'), {
			...process.env,
			...reservation.env,
		});
	} catch (error) {
		cleanupError = error;
		writeError(`E2E stack teardown failed: ${describeError(error)}\n`);
	} finally {
		// The band stays leased until teardown has finished: releasing earlier
		// would let another run claim ports this stack is still unbinding.
		try {
			await reservation.release();
		} catch (error) {
			releaseError = error;
			writeError(`E2E port lease release failed: ${describeError(error)}\n`);
		}
		process.removeListener('SIGINT', onCleanupSignal);
		process.removeListener('SIGTERM', onCleanupSignal);
	}

	// The primary failure is what the operator must see; every lower-priority
	// cleanup failure was already written out above, so nothing is swallowed —
	// but a run whose lease would not close is not a successful run either.
	if (lifecycleError !== undefined) {
		throw lifecycleError;
	}
	if (cleanupSignal !== undefined) {
		throw new E2ESignalAbortError(cleanupSignal);
	}
	if (cleanupError !== undefined) {
		throw cleanupError;
	}
	if (releaseError !== undefined) {
		throw releaseError;
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
