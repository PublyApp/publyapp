#!/usr/bin/env node
/*
 * run-guarded.mts — timeout wrapper for front guard tests.
 *
 * Every front guard test spawns a `node` subprocess (either `node --test`
 * for the test-harness guards, or a bare `node <script>.mts` for the
 * check-script guards). When a guard runner freezes — holding the CI gate
 * lock for 30+ minutes with 30+ waiters behind it (issue #1525) — a bare
 * `node --test` or `node` invocation has NO upper bound and never returns.
 *
 * This wrapper solves two problems at once:
 *
 * 1. PROCESS-TREE KILL. It spawns the target as a detached process group
 *    leader. On timeout it sends SIGKILL to the NEGATIVE process group ID,
 *    which kills the entire tree — the runner, any vite child, any spawned
 *    subprocess — in one call. A `kill(pid)` on just the runner PID leaves
 *    children orphaned and holding the lock (the exact #1525 failure).
 *    `kill(-pgid)` does not.
 *
 * 2. CLEAR ERROR MESSAGE. It prints an error that names the guard by its
 *    script path and how long it ran, replacing the silent block. A bare
 *    `timeout 300` that exits 124 without context is not enough — this is
 *    the product rule "every failure carries a human-readable cause".
 *
 * Usage (from apps/front):
 *   node scripts/run-guarded.mts [--node-flags...] <guard-script-path> [script-args...]
 *   node scripts/run-guarded.mts -- <command-line...>
 *
 * Any argument BEFORE the first non-flag argument (doesn't start with `-`)
 * is treated as a node flag (e.g. `--test`). The first non-flag argument
 * is the script path. Remaining args are passed to the script.
 *
 *   node scripts/run-guarded.mts --test scripts/guards/check-zindex-guard.test.mts
 *   node scripts/run-guarded.mts scripts/guards/check-design-system.mts
 *   node scripts/run-guarded.mts --test script1.mts script2.mts extra-arg
 *
 * A BARE `--` as the FIRST argument switches to passthrough mode: everything
 * after it is executed as one shell command line in the same process group
 * (used to bound non-node runners such as `vitest run` and `playwright test`,
 * which take no node `--test` form):
 *
 *   node scripts/run-guarded.mts -- vitest run --config vitest.design-guards.config.ts
 *
 * The timeout is read from GUARD_TIMEOUT_SECONDS env (default 300s).
 *
 * Justified default of 300s: measured durations of every front guard are
 * recorded in `docs/records/2026-08-30-analysis-front-guard-durations.md`
 * (raw timings of bounded runs, methodology included; slowest guard measured
 * ~165s loaded, next-slowest ~15s). 300s is ~1.8x the slowest measured guard
 * on the loaded recording machine — a modest margin, deliberately not
 * "ample": guards that routinely exceed it on a given machine can override
 * via `GUARD_TIMEOUT_SECONDS`, and the guard suite is re-measured whenever a
 * guard grows heavy (see the record).
 *
 * The `apps/front/scripts/guards/check-guard-coverage.mts` gate makes sure
 * every test:/check:/verify: script and every bare node invocation routes
 * through this wrapper; only the long-running `dev` and `start` servers are
 * exempt (a 300s bound would kill them mid-session).
 */
import { spawn, type ChildProcess } from 'node:child_process';
import process from 'node:process';

const parsedTimeoutSeconds = Number(process.env.GUARD_TIMEOUT_SECONDS ?? '300');
if (!Number.isFinite(parsedTimeoutSeconds) || parsedTimeoutSeconds <= 0) {
	const raw = process.env.GUARD_TIMEOUT_SECONDS ?? '(not set)';
	console.error(
		'\n' +
			'═'.repeat(72) +
			'\n' +
			`GUARD_TIMEOUT_SECONDS is invalid: got "${raw}", expected a finite number > 0.\n` +
			'═'.repeat(72) +
			'\n',
	);
	process.exit(2);
}
const GUARD_TIMEOUT_MS = Math.round(parsedTimeoutSeconds * 1000);

const rawArgs = process.argv.slice(2);

if (rawArgs.length === 0) {
	console.error(
		'run-guarded.mts: usage: run-guarded.mts [--node-flags...] <guard-script> [script-args...]' +
			' or run-guarded.mts -- <command-line...>',
	);
	process.exit(2);
}

// Passthrough mode: a bare `--` as the first argument means everything after
// it is one shell command line to bound (non-node runners: vitest, playwright).
let passthroughCommand: string | null = null;
if (rawArgs[0] === '--') {
	passthroughCommand = rawArgs.slice(1).join(' ');
	if (passthroughCommand.trim() === '') {
		console.error(
			'run-guarded.mts: empty command after `--`. usage: run-guarded.mts -- <command-line...>',
		);
		process.exit(2);
	}
}

// Split into node flags (everything before the first non-flag) and the
// script + its args. A "flag" starts with `-`. This handles both
// `node --test <script>` and `node <script>` and `node --test <s1> <s2>`.
const nodeFlags: string[] = [];
let scriptIndex = -1;
if (passthroughCommand === null) {
	for (let i = 0; i < rawArgs.length; i++) {
		const arg = rawArgs[i];
		if (arg.startsWith('-') && scriptIndex === -1) {
			nodeFlags.push(arg);
		} else {
			scriptIndex = i;
			break;
		}
	}

	if (scriptIndex === -1) {
		console.error(
			'run-guarded.mts: no guard script path found after flags. ' +
				'usage: run-guarded.mts [--node-flags...] <guard-script> [script-args...]',
		);
		process.exit(2);
	}
}

const guardScript = scriptIndex >= 0 ? rawArgs[scriptIndex]! : null;
const scriptArgs = scriptIndex >= 0 ? rawArgs.slice(scriptIndex + 1) : [];

// Derive a human-readable guard label for the error message.
const guardLabel =
	passthroughCommand !== null
		? passthroughCommand
		: guardScript!.includes('apps/front/')
			? guardScript!.split('apps/front/').pop()!
			: guardScript!;

const startMs = Date.now();

// Spawn the guard as the LEADER of a new process group (detached: true sets
// the child's PGID to its own PID). This means kill(-child.pid) targets the
// entire group, including every descendant the guard may spawn (vite, node,
// etc.).
// Passthrough mode spawns the shell command line directly (still as its own
// process-group leader: `sh -c` becomes the group leader and every descendant
// — vitest workers, playwright browsers — lands in the same group, so the
// timeout SIGKILL takes the whole tree).
const child: ChildProcess =
	passthroughCommand !== null
		? spawn(passthroughCommand, {
				cwd: process.cwd(),
				stdio: 'inherit',
				detached: true,
				shell: true,
			})
		: spawn(process.execPath, [...nodeFlags, guardScript!, ...scriptArgs], {
				cwd: process.cwd(),
				stdio: 'inherit',
				detached: true,
			});

let settled = false;

// Propagate SIGINT (Ctrl-C) / SIGTERM to the child process group so the
// entire tree dies with the wrapper — otherwise a detached child survives
// as an orphan (issue #1525-style leak on manual interruption).
const forwardSignal = (sig: NodeJS.Signals) => {
	if (settled || !child.pid || child.pid <= 0) {
		return;
	}
	try {
		process.kill(-child.pid, sig);
	} catch {
		// Child may have exited already.
	}
};

process.on('SIGINT', () => forwardSignal('SIGINT'));
process.on('SIGTERM', () => forwardSignal('SIGTERM'));

const watchdog = setTimeout(() => {
	// The guard exceeded the timeout. SIGKILL the entire process group.
	let killFailed = false;
	if (child.pid && child.pid > 0) {
		try {
			process.kill(-child.pid, 'SIGKILL');
		} catch {
			// Child may have exited between timeout firing and this call.
			killFailed = true;
		}
	}
	if (settled) {
		return;
	}
	settled = true;
	const elapsedSec = ((Date.now() - startMs) / 1000).toFixed(1);
	const cmdPreview = [...nodeFlags, guardLabel, ...scriptArgs].join(' ');
	const killResult = killFailed
		? 'failed to send SIGKILL — child process had already exited'
		: `process tree killed (PGID ${child.pid})`;
	console.error(
		'\n' +
			'═'.repeat(72) +
			'\n' +
			`GUARD TIMEOUT: "${guardLabel}" did not finish within ${parsedTimeoutSeconds}s ` +
			`(it ran for ${elapsedSec}s).\n` +
			`command: node ${cmdPreview}\n` +
			`${killResult}.\n` +
			'═'.repeat(72) +
			'\n',
	);
	process.exit(1);
}, GUARD_TIMEOUT_MS);

child.on('exit', (code: number | null, signal: NodeJS.Signals | null) => {
	if (settled) {
		return;
	}
	clearTimeout(watchdog);
	settled = true;
	// Pass through the real exit code. If the child was killed by a signal
	// (null code), mirror standard shell convention: 128 + signal number.
	// SIGINT (2) => 130, SIGTERM (15) => 143, SIGKILL (9) => 137.
	if (code !== null) {
		process.exit(code);
	}
	const signalMap = new Map<NodeJS.Signals, number>([
		['SIGINT', 130],
		['SIGTERM', 143],
		['SIGKILL', 137],
	]);
	process.exit(signal !== null ? (signalMap.get(signal) ?? 1) : 1);
});

child.on('error', (err: Error) => {
	if (settled) {
		return;
	}
	clearTimeout(watchdog);
	settled = true;
	console.error(
		`run-guarded.mts: failed to spawn guard "${guardLabel}":`,
		err.message,
	);
	process.exit(1);
});
