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
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
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

/** The real PIDs the harness's pending child publishes once it is up. */
type ChildTree = { child: number; grandchild: number };
type PublishedChildTree = { tree: ChildTree | null };

/**
 * Reads the harness's ready file, or null while it is not there yet. The file
 * is renamed into place fully written, so a successful read is complete.
 */
const readChildTree = (readyFile: string): ChildTree | null => {
	try {
		const parsed: unknown = JSON.parse(readFileSync(readyFile, 'utf8'));
		if (typeof parsed !== 'object' || parsed === null) {
			return null;
		}

		const { child, grandchild } = parsed as Partial<ChildTree>;
		if (typeof child !== 'number' || typeof grandchild !== 'number') {
			return null;
		}

		return { child, grandchild };
	} catch {
		return null;
	}
};

/**
 * Whether an exact PID is still alive, via `process.kill(pid, 0)` — Node's
 * native existence probe, which sends no signal.
 *
 * This replaces a `pgrep -f <token>` search. The token the harness was given
 * also appeared in the HARNESS's own argv (and in the test runner's), so the
 * search matched the parent as well as the child and never actually decided
 * anything about the tree under test.
 */
const isPidAlive = (pid: number): boolean => {
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		// ESRCH = gone; EPERM = alive but not ours to signal.
		return (error as NodeJS.ErrnoException).code === 'EPERM';
	}
};

/** Kills a PID outright, ignoring an already-dead process. */
const killPid = (pid: number): void => {
	try {
		process.kill(pid, 'SIGKILL');
	} catch {
		// Already gone: the expected outcome.
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
	/**
	 * Whether the whole tree was already dead BEFORE the spec's fallback
	 * cleanup ran. Recorded inside the run, because killing the PIDs before the
	 * assertion would manufacture the very result being asserted.
	 */
	treeDeadBeforeCleanup: boolean;
};

/**
 * Runs the harness, waits until its lock and its real child tree are both up,
 * sends `signal`, and returns everything the assertions need.
 */
const runHarnessAndSignal = async (
	signal: NodeJS.Signals,
	mode: 'lifecycle-signal' | 'cleanup-signal' = 'lifecycle-signal',
): Promise<SignalProof> => {
	const workDir = mkdtempSync(pathJoin(tmpdir(), 'publyapp-e2e-signal-'));
	const lockPath = pathJoin(workDir, 'band.lock');
	const readyFile = pathJoin(workDir, 'child-tree.json');

	const harness = spawn(
		process.execPath,
		[HARNESS, lockPath, readyFile, mode],
		{
			cwd: pathJoin(import.meta.dirname, '..'),
			stdio: ['ignore', 'pipe', 'pipe'],
		},
	);
	const exited = waitForExit(harness);

	// The published child tree, held in a one-field box so assignments made
	// inside the polling closures stay visible to the type checker (a plain
	// `let` narrowed to `never` after its initialiser).
	const published: PublishedChildTree = { tree: null };
	let treeDeadBeforeCleanup = false;

	try {
		// The runner must be fully engaged before the signal lands: the lock
		// exists, and BOTH the child and its grandchild are real live processes.
		await waitUntil(
			() => {
				if (!existsSync(lockPath)) {
					return false;
				}
				published.tree ??= readChildTree(readyFile);
				const tree = published.tree;

				return (
					tree !== null && isPidAlive(tree.child) && isPidAlive(tree.grandchild)
				);
			},
			20_000,
			'the harness lock file, its pending child, and its grandchild',
		);

		harness.kill(signal);

		const outcome = await exited;

		// Record the liveness verdict BEFORE the `finally` cleanup below runs:
		// the whole point is that the signal killed the tree, not the spec.
		try {
			await waitUntil(
				() => {
					const tree = published.tree;

					return (
						tree !== null &&
						!isPidAlive(tree.child) &&
						!isPidAlive(tree.grandchild)
					);
				},
				10_000,
				'the child and grandchild to be terminated by the forwarded signal',
			);
			treeDeadBeforeCleanup = true;
		} catch {
			treeDeadBeforeCleanup = false;
		}

		return {
			outcome,
			lockReleased: !existsSync(lockPath),
			treeDeadBeforeCleanup,
		};
	} finally {
		// Never leak a harness or its child out of a failing spec. Only now, after
		// the verdict is recorded, are the exact PIDs cleaned up.
		if (harness.exitCode === null && harness.signalCode === null) {
			harness.kill('SIGKILL');
		}
		if (published.tree !== null) {
			killPid(published.tree.grandchild);
			killPid(published.tree.child);
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
	const { outcome, lockReleased, treeDeadBeforeCleanup } =
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
		`the port band lock must be released on ${signal}`,
	);
	assert.match(
		outcome.stdout,
		/"event":"released"/,
		`the release path must run on ${signal}`,
	);
	// Teardown is unconditional now: a signalled run tears the stack down
	// instead of stranding containers that hold the band's ports.
	assert.match(
		outcome.stdout,
		/"event":"cleanup-started"|"event":"released"/,
		'the teardown must be attempted even on a signalled run',
	);
	assert.equal(
		/E2E stack left running for inspection/.test(outcome.stderr),
		false,
		'the stack must no longer be left running after a failure or signal',
	);
	assert.match(
		outcome.stderr,
		new RegExp(`front e2e aborted by ${signal}`),
		'the abort must surface a readable cause, not a stack trace',
	);
	assert.equal(
		treeDeadBeforeCleanup,
		true,
		`the forwarded ${signal} must kill the child AND its grandchild, ` +
			'without the spec cleaning up for it',
	);
};

// POSIX-only: these specs send real POSIX signals and observe a real process
// GROUP being terminated. Windows has neither, and its process-tree
// termination path (`taskkill /T`) is covered separately and without a Windows
// host by the `planWindowsTaskkill` / `signalChildTree` specs in
// run-e2e-front.launch.test.mts.
const posixOnly = {
	skip:
		process.platform === 'win32'
			? 'POSIX-only signal semantics; the Windows taskkill /T path is covered in run-e2e-front.launch.test.mts'
			: false,
};

void describe(
	'run-e2e-front signal handling (real processes)',
	posixOnly,
	() => {
		void it('releases the lock, kills the child, and exits 130 on SIGINT', async () => {
			await assertSignalContract('SIGINT', 130);
		});

		void it('releases the lock, kills the child, and exits 143 on SIGTERM', async () => {
			await assertSignalContract('SIGTERM', 143);
		});

		/**
		 * PROOF: a signal arriving DURING the final cleanup command must not
		 * default-kill the runner. Before the fix the handlers were removed just
		 * before teardown, so a Ctrl-C in that window restored the default
		 * disposition: the runner died instantly, teardown was orphaned mid-flight,
		 * and the lock stayed on disk forever.
		 */
		void it('finishes the teardown and releases the lock when signalled during cleanup', async () => {
			const { outcome, lockReleased, treeDeadBeforeCleanup } =
				await runHarnessAndSignal('SIGINT', 'cleanup-signal');

			assert.match(
				outcome.stdout,
				/"event":"cleanup-started"/,
				'the proof requires the signal to land while cleanup is running',
			);
			assert.match(
				outcome.stderr,
				/Received SIGINT during cleanup; finishing teardown before exiting\./,
				'the runner must report that it is finishing teardown, not dying',
			);
			assert.equal(
				lockReleased,
				true,
				'the lock must still be released when the signal lands during cleanup',
			);
			assert.match(
				outcome.stdout,
				/"event":"released"/,
				'the release path must run even for a signal during cleanup',
			);
			assert.equal(
				outcome.code,
				130,
				`the requested exit code must be latched through teardown (got ${String(
					outcome.code,
				)} / signal ${String(outcome.signal)}); stderr: ${outcome.stderr}`,
			);
			assert.equal(
				outcome.signal,
				null,
				'the runner must exit on its own terms, not be killed by the signal',
			);
			assert.equal(
				treeDeadBeforeCleanup,
				true,
				'the cleanup command tree must not be orphaned by the signal',
			);
		});
	},
);
