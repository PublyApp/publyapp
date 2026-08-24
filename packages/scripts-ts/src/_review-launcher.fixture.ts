#!/usr/bin/env node

// Test fixture for review-launcher.test.ts (#1020). Spawned as a real subprocess so
// utilities that call process.exit (err), register signal handlers, or depend on
// process-level state can be exercised without killing the vitest runner. Not imported
// anywhere; each mode below documents which utility it drives.

import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
	askChoice,
	ensureEnvCopy,
	ensurePortOpen,
	forwardTerminationSignals,
	parseLauncherArgs,
	parseStrictPort,
	requireResolvedWorktree,
	resolveReviewTarget,
	runLauncherCli,
} from './review-launcher.ts';

const [, , mode, ...rest] = process.argv;

if (mode === 'strict-port') {
	console.log(`PORT:${String(parseStrictPort(rest[0]))}`);
} else if (mode === 'parse-args') {
	const parsed = parseLauncherArgs(JSON.parse(rest[0]), JSON.parse(rest[1]));
	console.log(`PARSED:${JSON.stringify(parsed)}`);
} else if (mode === 'ensure-port-open') {
	await ensurePortOpen(Number(rest[0]), {
		// @ts-expect-error rung-0: TS2353 - `what` passes through untyped in the fixture
		what: rest[1],
	});
	console.log('PORT-FREE');
} else if (mode === 'ask-choice') {
	const picked = await askChoice('Pick one:', ['first', 'second']);
	console.log(`PICKED:${String(picked)}`);
} else if (mode === 'missing-env-source') {
	ensureEnvCopy('/definitely/not/a/worktree', '.env.definitely-missing-xyz');
	console.log('ENV-COPY-OK');
} else if (mode === 'hardlink-refusal') {
	// The test has already linked the root clone's env file into a temp dir; this mode
	// must refuse rather than rewrite the shared inode.
	ensureEnvCopy(rest[0]);
	console.log('NO-REFUSAL');
} else if (mode === 'env-copy-real-root') {
	// Exercises the real copy branch against the actual root clone env file into a temp
	// worktree dir created by the test; proves the happy path end to end.
	ensureEnvCopy(rest[0]);
	console.log('ENV-COPY-DONE');
} else if (mode === 'require-resolved') {
	requireResolvedWorktree(JSON.parse(rest[0]), rest[1] ?? '');
	console.log('RESOLVED-OK');
} else if (mode === 'resolve-review-target') {
	const resolved = await resolveReviewTarget({ requestedRef: rest[0] ?? '' });
	console.log(
		`TARGET:${JSON.stringify(resolved?.worktree?.path ?? resolved?.kind ?? null)}`,
	);
} else if (mode === 'forward-signals') {
	forwardTerminationSignals(
		// @ts-expect-error rung-0: TS7006 - signal stays untyped until a later rung
		(signal) => {
			console.log(`GOT:${String(signal)}`);
		},
	);
	console.log('READY');
	process.kill(process.pid, 'SIGINT');
	// Stay alive long enough for the signal handler to run, then exit deterministically
	// (a registered SIGINT handler suppresses the default exit).
	setTimeout(() => process.exit(0), 500);
} else if (mode === 'cli-guard-handled') {
	const main = async () => {
		const error = new Error('guard says no');
		// @ts-expect-error rung-0: TS2339 - code stays untyped until a later rung
		error.code = 'TEST_GUARD_CODE';
		throw error;
	};

	await runLauncherCli(main, fileURLToPath(import.meta.url), {
		TEST_GUARD_CODE:
			// @ts-expect-error rung-0: TS7006 - error stays untyped until a later rung
			(error) => `HANDLED:${error.message}`,
	});
} else if (mode === 'cli-guard-default') {
	const main = async () => {
		throw new Error('plain failure');
	};

	await runLauncherCli(main, fileURLToPath(import.meta.url));
} else if (mode === 'cli-guard-not-entry') {
	const main = async () => {
		console.log('MAIN-RAN');
	};

	await runLauncherCli(main, '/definitely/not/this/entry.ts');
	console.log('GUARD-BYPASS-OK');
}
