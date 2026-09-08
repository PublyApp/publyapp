import assert from 'node:assert/strict';
import type { ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { describe, it } from 'node:test';

import { runBoundedProcessTree, type TimerHandle } from './run-proof-child.mts';

type FakeTimer = {
	active: boolean;
	callback: () => void;
	delay: number;
};

const createFakeChild = (): EventEmitter & {
	kill: (signal: NodeJS.Signals) => boolean;
	pid: number;
	stderr: EventEmitter;
	stdout: EventEmitter;
} => {
	const child = new EventEmitter() as EventEmitter & {
		kill: (signal: NodeJS.Signals) => boolean;
		pid: number;
		stderr: EventEmitter;
		stdout: EventEmitter;
	};
	child.pid = 4311;
	child.stdout = new EventEmitter();
	child.stderr = new EventEmitter();
	child.kill = () => true;
	return child;
};

void describe('run-proof-child process-tree termination', () => {
	void it('keeps SIGKILL escalation after the leader exits before a resistant descendant', async () => {
		const child = createFakeChild();
		const timers: FakeTimer[] = [];
		const signals: NodeJS.Signals[] = [];
		let groupAlive = true;
		let resolved = false;

		const schedule = (callback: () => void, delay: number): FakeTimer => {
			const timer = { active: true, callback, delay };
			timers.push(timer);
			return timer;
		};
		const cancel = (timer: TimerHandle): void => {
			if (typeof timer === 'object' && timer !== null && 'active' in timer) {
				(timer as FakeTimer).active = false;
			}
		};
		const fire = (delay: number): void => {
			const timer = timers.find(
				(candidate) => candidate.active && candidate.delay === delay,
			);
			assert.ok(timer, `expected an active ${String(delay)}ms timer`);
			timer.active = false;
			timer.callback();
		};

		const run = runBoundedProcessTree(
			{
				file: process.execPath,
				args: ['proof-child-fixture'],
				cwd: process.cwd(),
				env: process.env,
				timeoutMs: 10,
				termGraceMs: 20,
				maxOutputLength: 1024,
			},
			{
				spawnChild: () => child as ChildProcess,
				signalChildTree: (_child, signal) => {
					signals.push(signal);
					if (signal === 'SIGKILL') {
						groupAlive = false;
					}
				},
				processGroupStillExists: () => groupAlive,
				setTimeout: schedule,
				clearTimeout: cancel,
				platform: 'linux',
			},
		).then((result) => {
			resolved = true;
			return result;
		});

		fire(10);
		child.emit('exit', null, 'SIGTERM');
		await Promise.resolve();
		assert.equal(resolved, false, 'leader exit must not resolve the wrapper');
		assert.deepEqual(signals, ['SIGTERM']);

		fire(20);
		const result = await run;
		assert.equal(result.status, 124);
		assert.deepEqual(signals, ['SIGTERM', 'SIGKILL']);
		assert.equal(resolved, true);
	});
});
