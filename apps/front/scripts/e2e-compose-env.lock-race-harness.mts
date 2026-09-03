#!/usr/bin/env node
/*
 * Test-only race harness for the port-band lock protocol.
 *
 * One OS process per contender: the specs spawn several of these, each pointed
 * at the SAME lock path inside a per-test lock root, and they all release from
 * a shared barrier before touching the lock. That is what makes the
 * concurrency proof real — a sequential `execFileSync` loop proves nothing,
 * because the first caller has already finished before the second starts.
 *
 * A winner does NOT exit when it wins. Its PID is recorded in the ownership
 * record, and a process that exited immediately would leave the surviving lock
 * instantly stale (dead PID), so the parent could no longer tell "the winner
 * still holds a live band" from "the protocol lost the band". Instead the
 * winner announces its win, then waits for the parent to create a release
 * file — staying alive, and its lock genuinely live, for the whole window in
 * which the parent inspects ownership and asserts nothing deleted it.
 *
 * Usage:
 *   lock-race-harness.mts <mode> <lock-path> <barrier-dir> <contenders> <id>
 *
 * mode: `acquire` (fresh acquisition race) or `reclaim` (stale reclamation).
 *
 * Prints exactly one JSON line and then, for a winner, blocks:
 *   {"result":"lost"}
 *   {"result":"won","token":...,"recordedToken":...,"pid":...}
 * The parent releases a waiting winner by creating `<barrier-dir>/release`.
 */
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join as pathJoin } from 'node:path';
import process from 'node:process';

import {
	acquireLockDir,
	reclaimStaleLock,
	readLockOwner,
} from './e2e-compose-env.mts';

const [mode, lockPath, barrierDir, contenderCount, id] = process.argv.slice(2);

if (!mode || !lockPath || !barrierDir || !contenderCount || !id) {
	process.stderr.write('lock-race-harness: missing arguments\n');
	process.exit(2);
}

const expected = Number.parseInt(contenderCount, 10);
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

	throw new Error(`lock-race-harness: timed out waiting for ${what}`);
};

/**
 * Barrier: announce readiness, then spin until every contender has announced.
 * A spin (not a timer) keeps the release window as tight as the scheduler
 * allows, so the contenders really do collide inside the lock protocol.
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

const token =
	mode === 'reclaim' ? reclaimStaleLock(lockPath) : acquireLockDir(lockPath);

if (token === null) {
	process.stdout.write(`${JSON.stringify({ result: 'lost' })}\n`);
	process.exit(0);
}

// A winner must be able to prove its own ownership through the shipped reader:
// a token nobody can read back is not an ownership record.
const owner = readLockOwner(lockPath);
process.stdout.write(
	`${JSON.stringify({
		result: 'won',
		token,
		recordedToken: owner?.token ?? null,
		pid: process.pid,
	})}\n`,
);

// Stay alive — and therefore stay a LIVE lock owner — until the parent has
// finished inspecting the surviving lock.
spinUntil(() => existsSync(RELEASE_FILE), 30_000, 'the parent release barrier');
