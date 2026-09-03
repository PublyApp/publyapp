#!/usr/bin/env node
/*
 * Test-only harness for the run-e2e-front signal contract.
 *
 * It runs the REAL `runE2EFront` lifecycle, replacing every lifecycle command
 * with one pending child executed through the REAL exported `runCommand` — so
 * the spawn, the process-group forwarding, the bounded escalation, the
 * semantic rejection and the `finally` lock release are production code paths.
 *
 * Usage: node run-e2e-front.signal-harness.mts <lock-path> <child-token>
 *
 * The child is a pending `node -e` timer carrying <child-token> in its argv,
 * so the test can find it (and prove it is gone) with a plain `pgrep -f`.
 * Each stdout line is one JSON event: `child-started` once the pending child
 * is spawned, `released` once the port band lock is released. On a signal the
 * harness exits with the runner's semantic code (130 SIGINT, 143 SIGTERM).
 */
import { unlinkSync, writeFileSync } from 'node:fs';
import process from 'node:process';

import type { E2eComposeEnv } from './e2e-compose-env.mts';
import {
	isSignalAbortError,
	runCommand,
	runE2EFront,
} from './run-e2e-front.mts';

const lockPath = process.argv[2];
const childToken = process.argv[3];
if (!lockPath || !childToken) {
	process.stderr.write(
		'signal-harness: usage: signal-harness.mts <lock-path> <child-token>\n',
	);
	process.exit(2);
}

// A real lock file, so the test can assert the `finally` actually unlinks it.
writeFileSync(lockPath, String(process.pid), 'utf8');

const derivedEnv: E2eComposeEnv = {
	COMPOSE_PROJECT_NAME: 'publyapp-e2e-signal-harness',
	E2E_PORT_TRAEFIK_WEB: '9080',
	E2E_PORT_TRAEFIK_WEBSECURE: '9443',
	E2E_PORT_REQUEST_COUNTER: '9800',
	E2E_PORT_TOXIPROXY: '9474',
	E2E_PORT_POSTGRES: '6454',
	E2E_BASE_URL: 'https://front.localhost:9443',
	E2E_API_BASE_URL: 'https://api.front.localhost:9443',
	E2E_LOCK_PATH: lockPath,
};

const emit = (payload: Record<string, unknown>): void => {
	process.stdout.write(`${JSON.stringify(payload)}\n`);
};

/** Removes the lock file the way the production release does. */
const releaseLock = (released: string): boolean => {
	emit({ event: 'released', lock: released });
	try {
		unlinkSync(released);
		return true;
	} catch {
		return false;
	}
};

try {
	await runE2EFront({
		computeEnv: () => derivedEnv,
		// Every lifecycle step becomes the same pending child, executed through
		// the production `runCommand` so the real signal plumbing is exercised.
		runCommand: async (_command, _args, env, abortSignal) => {
			const pending = runCommand(
				process.execPath,
				// Pending for 300s unless signalled; the token rides in argv so
				// `pgrep -f` can find it.
				['-e', 'setTimeout(() => {}, 300_000);', childToken],
				env,
				abortSignal,
			);
			emit({ event: 'child-started' });
			await pending;
		},
		releasePortBand: releaseLock,
		writeError: (message) => process.stderr.write(message),
	});
} catch (error) {
	if (isSignalAbortError(error)) {
		process.stderr.write(`${error.message}\n`);
		process.exit(error.exitCode);
	}
	process.stderr.write(
		`${error instanceof Error ? error.message : String(error)}\n`,
	);
	process.exit(1);
}
