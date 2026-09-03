#!/usr/bin/env node
/*
 * Test-only contention harness for the port-band lease.
 *
 * ONE OS PROCESS PER CONTENDER. The specs spawn several of these, all pointed
 * at the same lease range, and every one of them calls the SHIPPED
 * `reserveE2EComposeEnv` — not a copy of its logic, and not a raw socket bind.
 * That is what makes the exclusivity proof real: a same-process sequential
 * test only shows that one function returns different values on two calls,
 * which is exactly what a broken implementation with in-memory bookkeeping
 * would also do.
 *
 * The contenders release from a shared barrier so they collide INSIDE the
 * reservation rather than politely one after another, and a winner does NOT
 * exit once it has its band: it announces the band and then stays alive,
 * holding its lease socket, until the parent creates the release file. That
 * is the only way the parent can observe two reservations that are live AT
 * THE SAME TIME — a contender that exited immediately would hand its band
 * straight back and prove nothing about simultaneity.
 *
 * Usage:
 *   contention-harness.mts <lease-base-port> <max-bands> <barrier-dir> <contenders> <id>
 *
 * Prints exactly one JSON line, then blocks:
 *   {"result":"reserved","band":"8080","pid":1234}
 *   {"result":"failed","message":"..."}
 * The parent releases a waiting contender by creating `<barrier-dir>/release`.
 *
 * The service-port probe is stubbed out: this harness is about which BAND the
 * lease grants, and the real probe would spawn a child process per attempt and
 * report whatever unrelated software happens to be listening on the machine.
 * The lease range itself is injected for the same reason the specs inject it —
 * so a test can never take a band a real e2e run is holding.
 */
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join as pathJoin } from 'node:path';
import process from 'node:process';

import { reserveE2EComposeEnv } from './e2e-compose-env.mts';

const [
	leaseBasePortArgument,
	maxBandsArgument,
	barrierDir,
	contenderCountArgument,
	id,
] = process.argv.slice(2);

if (
	!leaseBasePortArgument ||
	!maxBandsArgument ||
	!barrierDir ||
	!contenderCountArgument ||
	!id
) {
	process.stderr.write(
		'contention-harness: usage: contention-harness.mts ' +
			'<lease-base-port> <max-bands> <barrier-dir> <contenders> <id>\n',
	);
	process.exit(2);
}

const leaseBasePort = Number(leaseBasePortArgument);
const maxBands = Number(maxBandsArgument);
const expected = Number(contenderCountArgument);
const RELEASE_FILE = pathJoin(barrierDir, 'release');

/** Spins until `predicate` holds, or throws after `timeoutMs`. */
const spinUntil = (
	predicate: () => boolean,
	timeoutMs: number,
	what: string,
): void => {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		if (predicate()) {
			return;
		}
	}

	throw new Error(`contention-harness: timed out waiting for ${what}`);
};

/**
 * Barrier: announce readiness, then spin until every contender has announced.
 * A spin rather than a timer keeps the release window as tight as the
 * scheduler allows, so the contenders really do collide inside the scan.
 */
const waitAtBarrier = (): void => {
	mkdirSync(barrierDir, { recursive: true });
	writeFileSync(pathJoin(barrierDir, `ready-${id}`), '1', 'utf8');

	spinUntil(
		() =>
			readdirSync(barrierDir).filter((entry) => entry.startsWith('ready-'))
				.length >= expected,
		30_000,
		'every contender to reach the barrier',
	);
};

waitAtBarrier();

try {
	const reservation = await reserveE2EComposeEnv(undefined, {
		leaseBasePort,
		maxBands,
		findOccupiedBandPorts: () => [],
	});

	process.stdout.write(
		`${JSON.stringify({
			result: 'reserved',
			band: reservation.env.E2E_PORT_TRAEFIK_WEB,
			pid: process.pid,
		})}\n`,
	);

	// Stay alive — and therefore keep the lease socket bound — until the parent
	// has finished comparing every contender's band.
	spinUntil(() => existsSync(RELEASE_FILE), 30_000, 'the parent release');

	await reservation.release();
} catch (error) {
	process.stdout.write(
		`${JSON.stringify({
			result: 'failed',
			message: error instanceof Error ? error.message : String(error),
		})}\n`,
	);
	process.exit(1);
}
