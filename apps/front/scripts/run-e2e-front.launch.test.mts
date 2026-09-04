#!/usr/bin/env node
/*
 * Launch-shape specs for `run-e2e-front.mts`.
 *
 * Node >=22.15 deprecates `spawn(command, args, { shell: true })`, so the
 * runner never uses that shape: POSIX and Windows `.exe`-style commands spawn
 * directly, and a Windows `.cmd` goes through an explicit command processor
 * with fixed internal arguments. These specs pin the resolved launch shape per
 * platform — the behaviour itself, not the syntax that produces it.
 */
import assert from 'node:assert/strict';
import process from 'node:process';
import { describe, it } from 'node:test';

import {
	planWindowsTaskkill,
	resolveSpawnLaunch,
	signalChildTree,
} from './run-e2e-front.mts';

const PNPM_ARGS = ['--filter', 'front', 'exec', 'playwright', 'test'];
const PLATFORMS = ['linux', 'darwin', 'win32'] as const;

void describe('run-e2e-front spawn launch shape', () => {
	void it('never requests a shell on any platform', () => {
		for (const platform of PLATFORMS) {
			for (const command of ['docker', 'pnpm', 'pnpm.cmd']) {
				const launch = resolveSpawnLaunch(command, PNPM_ARGS, platform);
				assert.equal(
					launch.shell,
					false,
					`${command} on ${platform} must not spawn through a shell`,
				);
			}
		}
	});

	void it('spawns docker directly on every platform', () => {
		const args = ['compose', '-f', 'apps/front/docker-compose.test.yml', 'up'];
		for (const platform of PLATFORMS) {
			const launch = resolveSpawnLaunch('docker', args, platform);
			assert.equal(launch.file, 'docker');
			assert.deepEqual(launch.args, args);
		}
	});

	void it('spawns pnpm directly on POSIX, .cmd suffix included', () => {
		for (const command of ['pnpm', 'pnpm.cmd']) {
			const launch = resolveSpawnLaunch(command, PNPM_ARGS, 'linux');
			assert.equal(launch.file, command);
			assert.deepEqual(launch.args, PNPM_ARGS);
		}
	});

	void it('routes a Windows .cmd through an explicit command processor', () => {
		const launch = resolveSpawnLaunch('pnpm.cmd', PNPM_ARGS, 'win32');
		assert.match(
			launch.file,
			/cmd\.exe$/i,
			'a .cmd must be launched by the command processor, not directly',
		);
		// `/d` skips AutoRun, `/s` fixes quote handling, `/c` runs and exits.
		assert.deepEqual(launch.args, ['/d', '/s', '/c', 'pnpm.cmd', ...PNPM_ARGS]);
	});

	void it('preserves the planned argument entries, including spaces', () => {
		const args = ['--filter', 'front', 'exec', 'a b', '"quoted"'];
		assert.deepEqual(resolveSpawnLaunch('pnpm', args, 'linux').args, args);
		// The plan keeps entries separate; cmd.exe performs the eventual parsing
		// on Windows, and production inputs are fixed internal literals.
		const windows = resolveSpawnLaunch('pnpm.cmd', args, 'win32');
		assert.deepEqual(windows.args.slice(4), args);
	});

	void it('does not mutate or alias the caller argument array', () => {
		const args = [...PNPM_ARGS];
		const launch = resolveSpawnLaunch('pnpm', args, 'linux');
		launch.args.push('injected');
		assert.deepEqual(args, PNPM_ARGS);
	});
});

void describe('run-e2e-front command processor resolution', () => {
	void it('honours COMSPEC when the host defines one', () => {
		const original = process.env.COMSPEC;
		process.env.COMSPEC = 'C:\\Windows\\System32\\cmd.exe';
		try {
			const launch = resolveSpawnLaunch('pnpm.cmd', PNPM_ARGS, 'win32');
			assert.equal(launch.file, 'C:\\Windows\\System32\\cmd.exe');
		} finally {
			if (original === undefined) {
				delete process.env.COMSPEC;
			} else {
				process.env.COMSPEC = original;
			}
		}
	});

	void it('falls back to cmd.exe when COMSPEC is absent', () => {
		const original = process.env.COMSPEC;
		delete process.env.COMSPEC;
		try {
			const launch = resolveSpawnLaunch('pnpm.cmd', PNPM_ARGS, 'win32');
			assert.equal(launch.file, 'cmd.exe');
		} finally {
			if (original !== undefined) {
				process.env.COMSPEC = original;
			}
		}
	});
});

/*
 * Windows has no process groups, so ending only the child handle would leave
 * pnpm/playwright/browser descendants orphaned. These specs pin the
 * `taskkill /T` plan and its call sequence without needing a Windows host.
 */
void describe('run-e2e-front Windows process-tree termination', () => {
	void it('plans a graceful tree kill then a forced one for a normal signal', () => {
		const plan = planWindowsTaskkill(4321, 'SIGTERM');
		assert.deepEqual(plan.graceful, ['/PID', '4321', '/T']);
		assert.deepEqual(plan.force, ['/PID', '4321', '/T', '/F']);
	});

	void it('skips the graceful attempt for SIGKILL, which is already an escalation', () => {
		const plan = planWindowsTaskkill(4321, 'SIGKILL');
		assert.equal(plan.graceful, null);
		assert.deepEqual(plan.force, ['/PID', '4321', '/T', '/F']);
	});

	void it('does not fall back to the child handle on Windows', () => {
		const calls: string[][] = [];
		let handleKills = 0;
		signalChildTree(
			{
				pid: 77,
				kill: () => {
					handleKills += 1;
					return true;
				},
			},
			'SIGTERM',
			{
				platform: 'win32',
				runTaskkill: (args) => (calls.push(args), { status: 0 }),
			},
		);
		assert.equal(handleKills, 0, 'child.kill would orphan the descendants');
		assert.deepEqual(calls, [['/PID', '77', '/T']]);
	});

	void it('escalates to /F when the graceful taskkill fails', () => {
		const calls: string[][] = [];
		signalChildTree({ pid: 77, kill: () => true }, 'SIGTERM', {
			platform: 'win32',
			runTaskkill: (args) => (calls.push(args), { status: 1 }),
		});
		assert.deepEqual(calls, [
			['/PID', '77', '/T'],
			['/PID', '77', '/T', '/F'],
		]);
	});

	void it('forces immediately on SIGKILL', () => {
		const calls: string[][] = [];
		signalChildTree({ pid: 77, kill: () => true }, 'SIGKILL', {
			platform: 'win32',
			runTaskkill: (args) => (calls.push(args), { status: 0 }),
		});
		assert.deepEqual(calls, [['/PID', '77', '/T', '/F']]);
	});

	void it('still signals the negative process group on POSIX', () => {
		const groupCalls: Array<[number, NodeJS.Signals]> = [];
		signalChildTree({ pid: 77, kill: () => true }, 'SIGINT', {
			platform: 'linux',
			runTaskkill: () => {
				throw new Error('taskkill must never run on POSIX');
			},
			killProcessGroup: (pid, signal) => {
				groupCalls.push([pid, signal]);
			},
		});
		assert.deepEqual(groupCalls, [[77, 'SIGINT']]);
	});

	void it('does nothing without a usable pid', () => {
		for (const pid of [undefined, 0, -1]) {
			signalChildTree({ pid, kill: () => true }, 'SIGTERM', {
				platform: 'win32',
				runTaskkill: () => {
					throw new Error('must not signal without a pid');
				},
			});
		}
	});
});
