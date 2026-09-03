#!/usr/bin/env node
/*
 * Real-process signal specs for `run-e2e-front.mts` — nothing here is mocked.
 * Each spec spawns the real harness, waits until it holds a real loopback
 * LEASE SOCKET and a real pending child, sends a real POSIX signal, then
 * asserts the three properties: the lease is released (the cleanup ran at
 * all), the pending child is gone (the signal reached the process group), and
 * the exit code is semantic (130 SIGINT, 143 SIGTERM).
 *
 * A socket lease has exactly one observable, and these specs use it: whether
 * the port can be bound. Before the signal it must NOT be bindable (the
 * harness owns it); after the harness exits it must be — either because the
 * runner released it, or, failing everything else, because the kernel closed
 * the descriptor of a dead process. That second guarantee is the point of the
 * whole design, and it is why there is no file to stat here any more.
 *
 * Before the fix, the default signal disposition killed the runner outright:
 * the cleanup never ran and the detached child survived.
 */
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join as pathJoin } from 'node:path';
import process from 'node:process';
import { describe, it } from 'node:test';

const HARNESS = pathJoin(
	import.meta.dirname,
	'run-e2e-front.signal-harness.mts',
);

const LEASE_HOST = '127.0.0.1';

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
 * An ephemeral port that is free right now, used as the harness's lease port.
 * Nothing else in the suite touches it, and it is well clear of the production
 * lease range (14000+), so a spec can never disturb a real e2e run.
 */
const findFreeLeasePort = async (): Promise<number> => {
	const server = createServer();
	const port = await new Promise<number>((resolvePort, rejectPort) => {
		server.once('error', rejectPort);
		server.listen({ host: LEASE_HOST, port: 0 }, () => {
			const address = server.address();
			if (address === null || typeof address === 'string') {
				rejectPort(new Error('no ephemeral port available'));
				return;
			}
			resolvePort(address.port);
		});
	});
	await new Promise<void>((resolveClose) => server.close(() => resolveClose()));

	return port;
};

/**
 * Whether `port` is currently held by somebody else — decided by trying to
 * bind it, which is the same question the production lease asks. A bind error
 * that is NOT EADDRINUSE is a defect in the spec's own environment and is
 * raised rather than reported as "held".
 */
const isLeaseHeld = async (port: number): Promise<boolean> =>
	await new Promise<boolean>((resolveHeld, rejectHeld) => {
		const server = createServer();
		server.once('error', (error: NodeJS.ErrnoException) => {
			if (error.code === 'EADDRINUSE') {
				resolveHeld(true);
				return;
			}
			rejectHeld(error);
		});
		server.listen({ host: LEASE_HOST, port, exclusive: true }, () => {
			server.close(() => resolveHeld(false));
		});
	});

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
	predicate: () => boolean | Promise<boolean>,
	timeoutMs: number,
	what: string,
): Promise<void> => {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		if (await predicate()) {
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

type HarnessRun = {
	exited: Promise<HarnessOutcome>;
	/** The stdout accumulated so far, so readiness can be observed live. */
	stdoutSoFar: () => string;
};

/** Streams the harness's output, exposing it both live and at exit. */
const watchHarness = (child: ChildProcess): HarnessRun => {
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

	return {
		exited: new Promise<HarnessOutcome>((resolveExit) => {
			child.once('exit', (code, signal) => {
				resolveExit({ code, signal, stdout, stderr });
			});
		}),
		stdoutSoFar: () => stdout,
	};
};

type HarnessMode = 'lifecycle-signal' | 'cleanup-signal' | 'acquiring';

type SignalProof = {
	outcome: HarnessOutcome;
	/** The harness really owned the lease port before the signal was sent. */
	leaseHeldBeforeSignal: boolean;
	/** The lease port is bindable again now that the harness has exited. */
	leaseReleased: boolean;
	/**
	 * Whether the whole tree was already dead BEFORE the spec's fallback
	 * cleanup ran. Recorded inside the run, because killing the PIDs before the
	 * assertion would manufacture the very result being asserted.
	 */
	treeDeadBeforeCleanup: boolean;
};

/**
 * Runs the harness, waits until its lease and its real child tree are both up,
 * sends `signal`, and returns everything the assertions need.
 */
const runHarnessAndSignal = async (
	signal: NodeJS.Signals,
	mode: HarnessMode = 'lifecycle-signal',
): Promise<SignalProof> => {
	const workDir = mkdtempSync(pathJoin(tmpdir(), 'publyapp-e2e-signal-'));
	const readyFile = pathJoin(workDir, 'child-tree.json');
	const leasePort = await findFreeLeasePort();

	const harness = spawn(
		process.execPath,
		[HARNESS, String(leasePort), readyFile, mode],
		{
			cwd: pathJoin(import.meta.dirname, '..'),
			stdio: ['ignore', 'pipe', 'pipe'],
		},
	);
	const { exited, stdoutSoFar } = watchHarness(harness);

	// The published child tree, held in a one-field box so assignments made
	// inside the polling closures stay visible to the type checker (a plain
	// `let` narrowed to `never` after its initialiser).
	const published: PublishedChildTree = { tree: null };
	let treeDeadBeforeCleanup = false;

	try {
		// The runner must be fully engaged before the signal lands. In the
		// acquisition window there is no child yet by construction — the
		// reservation has not resolved — so readiness is the announced bind.
		if (mode === 'acquiring') {
			await waitUntil(
				() => stdoutSoFar().includes('"event":"acquiring"'),
				20_000,
				'the harness to bind its lease inside the acquisition window',
			);
		} else {
			await waitUntil(
				async () => {
					if (!(await isLeaseHeld(leasePort))) {
						return false;
					}
					published.tree ??= readChildTree(readyFile);
					const tree = published.tree;

					return (
						tree !== null &&
						isPidAlive(tree.child) &&
						isPidAlive(tree.grandchild)
					);
				},
				20_000,
				'the harness lease, its pending child, and its grandchild',
			);
		}

		const leaseHeldBeforeSignal = await isLeaseHeld(leasePort);

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
			leaseHeldBeforeSignal,
			leaseReleased: !(await isLeaseHeld(leasePort)),
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
 * Asserts the full contract for one signal: semantic exit code, lease released
 * by the runner's cleanup, the release path actually taken, and the pending
 * child terminated by the signal forwarded to its process group.
 */
const assertSignalContract = async (
	signal: NodeJS.Signals,
	expectedCode: number,
): Promise<void> => {
	const {
		outcome,
		leaseHeldBeforeSignal,
		leaseReleased,
		treeDeadBeforeCleanup,
	} = await runHarnessAndSignal(signal);

	assert.equal(
		outcome.code,
		expectedCode,
		`${signal} must exit ${String(expectedCode)} (got code ${String(
			outcome.code,
		)} / signal ${String(outcome.signal)}); stderr: ${outcome.stderr}`,
	);
	assert.equal(
		leaseHeldBeforeSignal,
		true,
		'the harness must genuinely own the lease port before the signal',
	);
	assert.equal(
		leaseReleased,
		true,
		`the port band lease must be released on ${signal}`,
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
		/"event":"cleanup-started"/,
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
		void it('releases the lease, kills the child, and exits 130 on SIGINT', async () => {
			await assertSignalContract('SIGINT', 130);
		});

		void it('releases the lease, kills the child, and exits 143 on SIGTERM', async () => {
			await assertSignalContract('SIGTERM', 143);
		});

		/**
		 * PROOF: a signal arriving DURING the final cleanup command must not
		 * default-kill the runner. Before the fix the handlers were removed just
		 * before teardown, so a Ctrl-C in that window restored the default
		 * disposition: the runner died instantly, teardown was orphaned mid-flight,
		 * and the reservation was never handed back deliberately.
		 */
		void it('finishes the teardown and releases the lease when signalled during cleanup', async () => {
			const { outcome, leaseReleased, treeDeadBeforeCleanup } =
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
				leaseReleased,
				true,
				'the lease must still be released when the signal lands during cleanup',
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

		/**
		 * PROOF: the acquisition window is covered too. The handlers are installed
		 * before the reservation is awaited, so a signal landing while the lease
		 * scan is in flight reaches the runner's abort path instead of the default
		 * disposition — and the lease bound a moment earlier is handed back rather
		 * than held to the end of a process that is about to die anyway.
		 */
		void it('releases a lease bound during acquisition and exits 130 on SIGINT', async () => {
			const { outcome, leaseHeldBeforeSignal, leaseReleased } =
				await runHarnessAndSignal('SIGINT', 'acquiring');

			assert.equal(
				leaseHeldBeforeSignal,
				true,
				'the acquisition window must really hold the lease before the signal',
			);
			assert.equal(
				outcome.code,
				130,
				`a signal during acquisition must still exit 130 (got code ${String(
					outcome.code,
				)} / signal ${String(outcome.signal)}); stderr: ${outcome.stderr}`,
			);
			assert.equal(
				outcome.signal,
				null,
				'the runner must exit on its own terms, not be killed by the signal',
			);
			assert.match(
				outcome.stdout,
				/"event":"released"/,
				'an interrupted acquisition must release what it had already bound',
			);
			assert.equal(
				leaseReleased,
				true,
				'a signal during acquisition must not strand the lease',
			);
			assert.doesNotMatch(
				outcome.stdout,
				/"event":"cleanup-started"/,
				'a failed acquisition owns no stack, so it must run no teardown',
			);
		});
	},
);
