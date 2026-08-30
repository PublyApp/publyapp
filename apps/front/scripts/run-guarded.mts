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
 *
 * Any argument BEFORE the first non-flag argument (doesn't start with `-`)
 * is treated as a node flag (e.g. `--test`). The first non-flag argument
 * is the script path. Remaining args are passed to the script.
 *
 *   node scripts/run-guarded.mts --test scripts/guards/check-zindex-guard.test.mts
 *   node scripts/run-guarded.mts scripts/guards/check-design-system.mts
 *   node scripts/run-guarded.mts --test script1.mts script2.mts extra-arg
 *
 * The timeout is read from GUARD_TIMEOUT_SECONDS env (default 300s).
 *
 * Justified default of 300s: measured durations of all front guard tests
 * on this machine (loaded, 2026-08-30):
 *   - check-context-chunk-isolation.test.mts: ~157s (slowest; ~68s on CI)
 *   - check-zindex-guard.test.mts:              ~56s (~40s on CI)
 *   - check-design-system.test.mts:             ~3s
 *   - check-shared-ts-import-paths.test.mts:   ~19s
 *   - check-react-compiler.test.mts:            ~19s
 *   - check-shared-ts-node-resolution.test.mts: ~4s
 *   - check-e2e-shared-constants.test.mts:     ~0s
 *   - check-column-type-imports.test.mts:      ~0s
 *   - verify-font-bundle.test.mts:             ~0s
 *   - search-cancel-css-policy.test.mts:       ~0s
 *   - all check:* script guards (< 2s each):   < 2s
 *
 * 300s is ~1.9× the slowest measured guard (157s), bounding the worst-case
 * freeze to 5 minutes instead of indefinite while giving ample headroom for a
 * loaded machine. Guards that routinely exceed this on a specific machine can
 * override via `GUARD_TIMEOUT_SECONDS` env var.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import process from 'node:process';

const GUARD_TIMEOUT_SECONDS = Number(
	process.env.GUARD_TIMEOUT_SECONDS ?? '300',
);
const GUARD_TIMEOUT_MS = Math.round(GUARD_TIMEOUT_SECONDS * 1000);

const rawArgs = process.argv.slice(2);

if (rawArgs.length === 0) {
	console.error(
		'run-guarded.mts: usage: run-guarded.mts [--node-flags...] <guard-script> [script-args...]',
	);
	process.exit(2);
}

// Split into node flags (everything before the first non-flag) and the
// script + its args. A "flag" starts with `-`. This handles both
// `node --test <script>` and `node <script>` and `node --test <s1> <s2>`.
const nodeFlags: string[] = [];
let scriptIndex = -1;
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

const guardScript = rawArgs[scriptIndex]!;
const scriptArgs = rawArgs.slice(scriptIndex + 1);

// Derive a human-readable guard label for the error message.
const guardLabel = guardScript.includes('apps/front/')
	? guardScript.split('apps/front/').pop()!
	: guardScript;

const startMs = Date.now();

// Spawn the guard as the LEADER of a new process group (detached: true sets
// the child's PGID to its own PID). This means kill(-child.pid) targets the
// entire group, including every descendant the guard may spawn (vite, node,
// etc.).
const child: ChildProcess = spawn(
	process.execPath,
	[...nodeFlags, guardScript, ...scriptArgs],
	{
		cwd: process.cwd(),
		stdio: 'inherit',
		detached: true,
	},
);

let settled = false;

const failHard = (exitCode: number): never => {
	if (settled) {
		throw new Error('failHard called after settlement');
	}
	settled = true;
	const elapsedSec = ((Date.now() - startMs) / 1000).toFixed(1);
	const cmdPreview =
		[...nodeFlags, guardLabel, ...scriptArgs].join(' ');
	console.error(
		'\n' +
			'═'.repeat(72) +
			'\n' +
			`GUARD TIMEOUT: "${guardLabel}" did not finish within ${GUARD_TIMEOUT_SECONDS}s ` +
			`(it ran for ${elapsedSec}s).\n` +
			`command: node ${cmdPreview}\n` +
			`process tree killed (PGID ${child.pid}).\n` +
			'═'.repeat(72) +
			'\n',
	);
	process.exit(exitCode);
};

const watchdog = setTimeout(() => {
	// The guard exceeded the timeout. SIGKILL the entire process group.
	if (child.pid && child.pid > 0) {
		try {
			process.kill(-child.pid, 'SIGKILL');
		} catch {
			// Child may have exited between timeout firing and this call.
		}
	}
	failHard(1);
}, GUARD_TIMEOUT_MS);

child.on('exit', (code: number | null) => {
	if (settled) {
		return;
	}
	clearTimeout(watchdog);
	settled = true;
	// Pass through the real exit code. If null (killed by signal), exit 0
	// would be wrong — use 130 (128+SIGINT=2) for interruption, but
	// normally the guard exits on its own with a real code.
	process.exit(code ?? 0);
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
