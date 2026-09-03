#!/usr/bin/env node
/*
 * Test-only harness for the run-e2e-front signal contract.
 *
 * It runs the REAL `runE2EFront` lifecycle, replacing every lifecycle command
 * with one pending child executed through the REAL exported `runCommand` — so
 * the spawn, the process-group forwarding, the bounded escalation, the
 * semantic rejection and the release of the port-band lease are production
 * code paths.
 *
 * Usage:
 *   node run-e2e-front.signal-harness.mts <lease-port> <ready-file> <mode>
 *
 * The reservation is a REAL loopback lease: the injected `reserveEnv` binds
 * 127.0.0.1:<lease-port> exclusively and only then publishes readiness, so the
 * parent can decide "the lease is held" by trying to bind it (EADDRINUSE) and
 * "the lease was released" by binding it successfully after exit. That is the
 * only observable a socket lease has — there is no file to stat.
 *
 * The child is a pending `node -e` timer that in turn spawns a GRANDCHILD.
 * Only a signal that reached the whole process GROUP kills the grandchild too,
 * so asserting on the grandchild is what proves the tree was terminated rather
 * than just the direct child. The child publishes both REAL PIDs into
 * <ready-file>, so the spec checks liveness with `process.kill(pid, 0)` on
 * exact PIDs instead of matching argv text (an argv token also matches the
 * harness's own command line, which is precisely why the token approach could
 * never return a meaningful verdict).
 *
 * Each stdout line is one JSON event: `acquiring` once the lease is bound but
 * the reservation has not yet resolved, `child-started` once the pending child
 * is spawned, `cleanup-started` when the final teardown command begins, and
 * `released` once the lease socket is closed. On a signal the harness exits
 * with the runner's semantic code (130 SIGINT, 143 SIGTERM).
 *
 * Modes:
 * - `lifecycle-signal`: a lifecycle step blocks, so the signal lands there.
 * - `cleanup-signal`: the lifecycle succeeds instantly and the final teardown
 *   blocks — the window in which a signal used to default-kill the runner,
 *   orphaning teardown and stranding the reservation.
 * - `acquiring`: the reservation binds its lease and then never resolves, so
 *   the signal lands while acquisition is still in flight.
 */
import { createServer, type Server } from 'node:net';
import process from 'node:process';

import type {
	E2eComposeEnv,
	E2eComposeReservation,
} from './e2e-compose-env.mts';
import {
	isSignalAbortError,
	runCommand,
	runE2EFront,
} from './run-e2e-front.mts';

const leasePortArgument = process.argv[2];
const readyFile = process.argv[3];
const mode = process.argv[4] ?? 'lifecycle-signal';
const leasePort = Number(leasePortArgument);

if (!leasePortArgument || !readyFile || !Number.isInteger(leasePort)) {
	process.stderr.write(
		'signal-harness: usage: signal-harness.mts <lease-port> <ready-file> [mode]\n',
	);
	process.exit(2);
}

const derivedEnv: E2eComposeEnv = {
	COMPOSE_PROJECT_NAME: 'publyapp-e2e-signal-harness',
	E2E_PORT_TRAEFIK_WEB: '9080',
	E2E_PORT_TRAEFIK_WEBSECURE: '9443',
	E2E_PORT_REQUEST_COUNTER: '9800',
	E2E_PORT_TOXIPROXY: '9474',
	E2E_PORT_POSTGRES: '6454',
	E2E_BASE_URL: 'https://front.localhost:9443',
	E2E_API_BASE_URL: 'https://api.front.localhost:9443',
};

const emit = (payload: Record<string, unknown>): void => {
	process.stdout.write(`${JSON.stringify(payload)}\n`);
};

/** Binds the harness's lease port exclusively, the way production does. */
const bindLease = async (port: number): Promise<Server> =>
	await new Promise<Server>((resolveBind, rejectBind) => {
		const server = createServer();
		server.once('error', rejectBind);
		server.listen({ host: '127.0.0.1', port, exclusive: true }, () => {
			resolveBind(server);
		});
	});

/** Closes the lease socket, awaiting the close and surfacing its failure. */
const closeLease = async (server: Server): Promise<void> =>
	await new Promise<void>((resolveClose, rejectClose) => {
		server.close((error) => {
			if (error) {
				rejectClose(error);
				return;
			}
			resolveClose();
		});
	});

/**
 * The reservation under test: a real exclusive lease on the port the spec
 * chose. Readiness is published only AFTER the bind, so a parent that observes
 * the port as occupied knows the runner truly owns it.
 */
const reserveEnv = async (
	abortSignal: AbortSignal,
): Promise<E2eComposeReservation> => {
	const server = await bindLease(leasePort);
	const release = async (): Promise<void> => {
		await closeLease(server);
		emit({ event: 'released', leasePort });
	};

	if (mode === 'acquiring') {
		// The runner's handlers are installed and the lease is bound, but the
		// reservation has not resolved: the runner owns a socket it does not yet
		// know about. A signal landing here must still free it.
		emit({ event: 'acquiring', leasePort });

		const reason = await new Promise<unknown>((resolveAbort) => {
			abortSignal.addEventListener(
				'abort',
				() => resolveAbort(abortSignal.reason),
				{ once: true },
			);
		});

		await release();
		throw reason instanceof Error ? reason : new Error(String(reason));
	}

	return { env: derivedEnv, release };
};

/**
 * The pending child: it spawns a grandchild, publishes BOTH real PIDs to the
 * ready file, and then blocks. Publishing actual PIDs (rather than letting the
 * parent `pgrep` for an argv token) is what makes the liveness verdict exact:
 * the token also appears in the harness's OWN argv, so a token search matches
 * the harness itself and can never isolate the child tree.
 *
 * The ready file is written to a temp sibling and renamed into place, so the
 * parent never reads a half-written record.
 */
const PENDING_CHILD_SOURCE = `
	const { spawn } = require('node:child_process');
	const { renameSync, writeFileSync } = require('node:fs');
	const readyFile = process.argv[1];
	const durationMs = Number(process.argv[2]);
	const grandchild = spawn(
		process.execPath,
		['-e', 'setTimeout(() => {}, Number(process.argv[1]));', String(durationMs)],
		{ stdio: 'ignore' },
	);
	const staging = readyFile + '.staging';
	writeFileSync(
		staging,
		JSON.stringify({ child: process.pid, grandchild: grandchild.pid }),
		'utf8',
	);
	renameSync(staging, readyFile);
	setTimeout(() => {}, durationMs);
`;

// The teardown command is deliberately NOT abortable (an aborted teardown is
// no teardown), so the cleanup-window child must end on its own. It stays
// alive long enough for the signal to land mid-cleanup, then completes —
// exactly like a real `docker compose down` finishing after a Ctrl-C.
const CLEANUP_CHILD_MS = 5000;
const LIFECYCLE_CHILD_MS = 300_000;

/** One pending lifecycle command, run through the production `runCommand`. */
const pendingChild = async (
	env: NodeJS.ProcessEnv,
	abortSignal: AbortSignal | undefined,
	event: string,
	durationMs: number,
): Promise<void> => {
	const pending = runCommand(
		process.execPath,
		['-e', PENDING_CHILD_SOURCE, readyFile, String(durationMs)],
		env,
		abortSignal,
	);
	emit({ event });
	await pending;
};

try {
	await runE2EFront({
		reserveEnv,
		// Every lifecycle step becomes the same pending child, executed through
		// the production `runCommand` so the real signal plumbing is exercised.
		runCommand: async (_command, _args, env, abortSignal) => {
			// The final teardown is the only command the runner issues without an
			// abort signal, which is exactly how the cleanup window is identified.
			const isCleanup = abortSignal === undefined;

			if (mode === 'cleanup-signal') {
				// The lifecycle succeeds instantly; only the teardown blocks, so
				// the signal under test lands DURING the final cleanup command.
				if (!isCleanup) {
					return;
				}
				await pendingChild(
					env,
					abortSignal,
					'cleanup-started',
					CLEANUP_CHILD_MS,
				);
				return;
			}

			// lifecycle-signal: the LIFECYCLE step is the one that blocks. Teardown
			// is unconditional now, so it must return promptly — a teardown that
			// also blocked for the lifecycle child's five minutes would hang the
			// harness after the signal had already done its job, and the spec would
			// time out on the harness rather than on the behaviour under test.
			if (isCleanup) {
				emit({ event: 'cleanup-started' });
				return;
			}

			await pendingChild(env, abortSignal, 'child-started', LIFECYCLE_CHILD_MS);
		},
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
