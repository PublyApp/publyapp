#!/usr/bin/env node
/*
 * Real-process signal specs for `run-e2e-front.mts` — nothing here is mocked.
 * Each spec spawns the real harness, waits until it holds a real lock file and
 * a real pending child, sends a real POSIX signal, then asserts the three
 * properties: the lock is released (the `finally` ran at all), the pending
 * child is gone (the signal reached the process group), and the exit code is
 * semantic (130 SIGINT, 143 SIGTERM).
 *
 * Before the fix, the default signal disposition killed the runner outright:
 * the `finally` never ran (lock leaked) and the detached child survived.
 */
import assert from 'node:assert/strict';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join as pathJoin } from 'node:path';
import process from 'node:process';
import { describe, it } from 'node:test';

const HARNESS = pathJoin(
	import.meta.dirname,
	'run-e2e-front.signal-harness.mts',
);

const delay = (ms: number): Promise<void> =>
	new Promise((resolveDelay) => setTimeout(resolveDelay, ms));

/** True while at least one process carries `token` in its argv. */
const tokenIsAlive = (token: string): boolean => {
	try {
		const output = execFileSync('pgrep', ['-f', token], {
			encoding: 'utf8',
		});
		return output.trim().length > 0;
	} catch {
		// pgrep exits 1 when nothing matches.
		return false;
	}
};

/** Polls `predicate` until it holds, or throws after `timeoutMs`. */
const waitUntil = async (
	predicate: () => boolean,
	timeoutMs: number,
	what: string,
): Promise<void> => {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		if (predicate()) {
			return;
		}
		await delay(50);
	}
	throw new Error(`timed out after ${String(timeoutMs)}ms waiting for ${what}`);
};

type HarnessOutcome = {
	code: number | null;
	signal: NodeJS.Signals | null;
	stdout: string;
	stderr: string;
};

/** Waits for the harness process to exit, capturing its outcome. */
const waitForExit = (child: ChildProcess): Promise<HarnessOutcome> => {
	let stdout = '';
	let stderr = '';
	child.stdout?.setEncoding('utf8');
	child.stderr?.setEncoding('utf8');
	child.stdout?.on('data', (chunk: string) => {
		stdout += chunk;
	});
	child.stderr?.on('data', (chunk: string) => {
		stderr += chunk;
	});

	return new Promise<HarnessOutcome>((resolveExit) => {
		child.once('exit', (code, signal) => {
			resolveExit({ code, signal, stdout, stderr });
		});
	});
};

type SignalProof = {
	outcome: HarnessOutcome;
	lockReleased: boolean;
	childToken: string;
};

/**
 * Runs the harness, waits until its lock and pending child are both real,
 * sends `signal`, and returns everything the assertions need.
 */
const runHarnessAndSignal = async (
	signal: NodeJS.Signals,
): Promise<SignalProof> => {
	const workDir = mkdtempSync(pathJoin(tmpdir(), 'publyapp-e2e-signal-'));
	const lockPath = pathJoin(workDir, 'band.lock');
	const childToken = `publyapp-e2e-signal-child-${String(process.pid)}-${signal}`;

	const harness = spawn(process.execPath, [HARNESS, lockPath, childToken], {
		cwd: pathJoin(import.meta.dirname, '..'),
		stdio: ['ignore', 'pipe', 'pipe'],
	});
	const exited = waitForExit(harness);

	try {
		// The runner must be fully engaged before the signal lands.
		await waitUntil(
			() => existsSync(lockPath) && tokenIsAlive(childToken),
			20_000,
			'the harness lock file and its pending child',
		);

		harness.kill(signal);

		const outcome = await exited;
		return { outcome, lockReleased: !existsSync(lockPath), childToken };
	} finally {
		// Never leak a harness or its child out of a failing spec.
		if (harness.exitCode === null && harness.signalCode === null) {
			harness.kill('SIGKILL');
		}
		try {
			execFileSync('pkill', ['-9', '-f', childToken], { stdio: 'ignore' });
		} catch {
			// Nothing left to kill: the expected outcome.
		}
		rmSync(workDir, { recursive: true, force: true });
	}
};

/**
 * Asserts the full contract for one signal: semantic exit code, lock released
 * by the `finally`, the release path actually taken, and the pending child
 * terminated by the signal forwarded to its process group.
 */
const assertSignalContract = async (
	signal: NodeJS.Signals,
	expectedCode: number,
): Promise<void> => {
	const { outcome, lockReleased, childToken } =
		await runHarnessAndSignal(signal);

	assert.equal(
		outcome.code,
		expectedCode,
		`${signal} must exit ${String(expectedCode)} (got code ${String(
			outcome.code,
		)} / signal ${String(outcome.signal)}); stderr: ${outcome.stderr}`,
	);
	assert.equal(
		lockReleased,
		true,
		`the finally block must release the port band lock on ${signal}`,
	);
	assert.match(
		outcome.stdout,
		/"event":"released"/,
		`the release path must run on ${signal}`,
	);
	assert.match(
		outcome.stderr,
		/E2E stack left running for inspection after failure\./,
		'a signalled run must keep the failed stack inspectable',
	);
	assert.match(
		outcome.stderr,
		new RegExp(`front e2e aborted by ${signal}`),
		'the abort must surface a readable cause, not a stack trace',
	);
	await waitUntil(
		() => !tokenIsAlive(childToken),
		10_000,
		`the pending child to be terminated by the forwarded ${signal}`,
	);
};

void describe('run-e2e-front signal handling (real processes)', () => {
	void it('releases the lock, kills the child, and exits 130 on SIGINT', async () => {
		await assertSignalContract('SIGINT', 130);
	});

	void it('releases the lock, kills the child, and exits 143 on SIGTERM', async () => {
		await assertSignalContract('SIGTERM', 143);
	});
});
