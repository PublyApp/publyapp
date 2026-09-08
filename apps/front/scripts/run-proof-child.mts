import { spawn, type ChildProcess } from 'node:child_process';

import { processGroupStillExists, signalChildTree } from './run-e2e-front.mts';

export type BoundedProcessResult = {
	status: number | null;
	stdout: string;
	stderr: string;
	error?: Error;
};

export type BoundedProcessTreeSpec = {
	file: string;
	args: string[];
	cwd: string;
	env: NodeJS.ProcessEnv;
	timeoutMs: number;
	termGraceMs: number;
	maxOutputLength: number;
};

type SpawnChild = (
	file: string,
	args: string[],
	options: {
		cwd: string;
		detached: boolean;
		env: NodeJS.ProcessEnv;
		stdio: ['ignore', 'pipe', 'pipe'];
	},
) => ChildProcess;

export interface TimerHandle {}
type ScheduleTimer = (callback: () => void, delay: number) => TimerHandle;
type CancelTimer = (timer: TimerHandle) => void;
type GroupProbe = (
	pid: number | undefined,
	platform?: NodeJS.Platform,
) => boolean;

type BoundedProcessTreeDependencies = {
	spawnChild?: SpawnChild;
	signalChildTree?: typeof signalChildTree;
	processGroupStillExists?: GroupProbe;
	setTimeout?: ScheduleTimer;
	clearTimeout?: CancelTimer;
	platform?: NodeJS.Platform;
};

const errorText = (error: unknown): string =>
	error instanceof Error ? `${error.name}: ${error.message}` : String(error);

const readChildOutput = (
	current: string,
	chunk: Buffer | string,
	maxOutputLength: number,
): string => {
	if (current.length >= maxOutputLength) {
		return current;
	}

	const remaining = maxOutputLength - current.length;
	return current + chunk.toString().slice(0, remaining);
};

const defaultSpawnChild: SpawnChild = (file, args, options) =>
	spawn(file, args, options);

export const runBoundedProcessTree = (
	spec: BoundedProcessTreeSpec,
	dependencies: BoundedProcessTreeDependencies = {},
): Promise<BoundedProcessResult> =>
	new Promise((resolveResult) => {
		const spawnChild = dependencies.spawnChild ?? defaultSpawnChild;
		const signalTree = dependencies.signalChildTree ?? signalChildTree;
		const groupProbe =
			dependencies.processGroupStillExists ?? processGroupStillExists;
		const platform = dependencies.platform ?? process.platform;
		const schedule =
			dependencies.setTimeout ??
			((callback: () => void, delay: number) => setTimeout(callback, delay));
		const cancel =
			dependencies.clearTimeout ??
			((timer: TimerHandle) => clearTimeout(timer as NodeJS.Timeout));
		const child = spawnChild(spec.file, spec.args, {
			cwd: spec.cwd,
			detached: true,
			env: spec.env,
			stdio: ['ignore', 'pipe', 'pipe'],
		});

		let stdout = '';
		let stderr = '';
		let timedOut = false;
		let settled = false;
		let killTimer: TimerHandle | undefined;
		let groupPollTimer: TimerHandle | undefined;
		let postKillTimer: TimerHandle | undefined;

		const finish = (result: BoundedProcessResult): void => {
			if (settled) {
				return;
			}
			settled = true;
			cancel(timeoutTimer);
			if (killTimer !== undefined) {
				cancel(killTimer);
			}
			if (groupPollTimer !== undefined) {
				cancel(groupPollTimer);
			}
			if (postKillTimer !== undefined) {
				cancel(postKillTimer);
			}
			process.removeListener('SIGINT', onSignal);
			process.removeListener('SIGTERM', onSignal);
			resolveResult(result);
		};

		const finishTimedOut = (): void => {
			stderr += `\nE2E proof child exceeded ${spec.timeoutMs}ms and was terminated.`;
			finish({ status: 124, stdout, stderr });
		};

		const waitForTreeTermination = (): void => {
			postKillTimer = schedule(() => {
				if (platform !== 'win32' && groupProbe(child.pid, platform)) {
					stderr +=
						'\nMESURE IMPOSSIBLE: forced proof child group termination was not observed.';
					signalTree(child, 'SIGKILL');
				}
				finishTimedOut();
			}, spec.termGraceMs);

			if (platform === 'win32') {
				return;
			}

			const poll = (): void => {
				if (!groupProbe(child.pid, platform)) {
					finishTimedOut();
					return;
				}
				groupPollTimer = schedule(poll, 50);
			};

			poll();
		};

		const requestTermination = (): void => {
			if (settled || timedOut) {
				return;
			}
			timedOut = true;
			signalTree(child, 'SIGTERM');
			killTimer = schedule(() => {
				if (settled) {
					return;
				}
				signalTree(child, 'SIGKILL');
				waitForTreeTermination();
			}, spec.termGraceMs);
		};

		const onSignal = (): void => {
			requestTermination();
		};

		const timeoutTimer = schedule(requestTermination, spec.timeoutMs);

		child.stdout?.on('data', (chunk: Buffer | string) => {
			stdout = readChildOutput(stdout, chunk, spec.maxOutputLength);
		});
		child.stderr?.on('data', (chunk: Buffer | string) => {
			stderr = readChildOutput(stderr, chunk, spec.maxOutputLength);
		});
		child.once('error', (error) => {
			if (timedOut) {
				stderr += `\nE2E proof child error during termination: ${errorText(error)}`;
				return;
			}
			finish({ status: null, stdout, stderr, error });
		});
		child.once('exit', (status, signal) => {
			if (timedOut) {
				// The leader may exit while a TERM-resistant descendant keeps the
				// detached group alive. Leave escalation armed until it is gone.
				if (groupProbe(child.pid, platform)) {
					return;
				}
				finishTimedOut();
				return;
			}

			finish({
				status: status ?? 1,
				stdout,
				stderr: signal === null ? stderr : `${stderr}\nchild signal: ${signal}`,
			});
		});

		process.once('SIGINT', onSignal);
		process.once('SIGTERM', onSignal);
	});
