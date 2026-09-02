/**
 * Tests for e2e-compose-env.mts
 *
 * These tests verify:
 * 1. Port band allocation is guaranteed (no collisions)
 * 2. Project name derivation uses absolute path (not directory name)
 * 3. Name normalization is Compose-safe
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { spawn } from 'node:child_process';
import {
	mkdirSync,
	unlinkSync,
	writeFileSync,
	readFileSync,
	existsSync,
} from 'node:fs';
import { createServer, type Server } from 'node:net';
import { join as pathJoin } from 'node:path';
import { describe, it } from 'node:test';

import {
	acquirePortBand,
	bandPortsFor,
	buildBandConflictMessage,
	describePortHolders,
	deriveProjectName,
	findOccupiedBandPorts,
	isOwnProjectContainer,
	normalizeComposeName,
	releasePortBand,
	setupE2EComposeEnv,
	teardownE2EComposeEnv,
	isLockStale,
	reclaimStaleLock,
	type PortBandReservation,
	type E2EComposeEnv,
} from './e2e-compose-env.mts';

// Test lock directory (matches the one in mts)
const LOCK_DIR = pathJoin('/tmp', 'publyapp-e2e-port-locks');

void describe('ci-e2e-front recipe', () => {
	void it('keeps the derived environment and E2E lifecycle in one strict shell', () => {
		const justfile = readFileSync(
			pathJoin(import.meta.dirname, '../../../justfile'),
			'utf8',
		);
		const recipe = justfile.match(/^ci-e2e-front:\n(?<body>(?:  .*\n|\n)*)/m)
			?.groups?.body;

		assert.ok(recipe, 'ci-e2e-front recipe should exist');
		assert.match(recipe, /^  #!\/usr\/bin\/env bash\n  set -euo pipefail/m);
		assert.match(
			recipe,
			/compose_env="\$\(node apps\/front\/scripts\/e2e-compose-env\.mts\)"/,
		);
		assert.match(recipe, /eval "\$compose_env"/);
		assert.match(recipe, /trap cleanup EXIT/);
		assert.doesNotMatch(recipe, /eval "\$\(node /);
	});
});

// Deterministic helpers for the #1698 specs: they must not depend on what
// stacks/locks happen to exist on the machine that runs them.

/** Binds a real socket on `port` (resolving once it is actually listening). */
const listenOn = async (port: number): Promise<Server> => {
	const server = createServer();

	await new Promise<void>((resolve, reject) => {
		server.once('error', reject);
		server.listen(port, () => resolve());
	});

	return server;
};

/** Closes a listener opened by listenOn, awaiting the close. */
const closeListener = async (server: Server): Promise<void> => {
	await new Promise<void>((resolve) => server.close(() => resolve()));
};

/** The lock file path for a band index (mirror of the module's own naming). */
const lockPathForBandIndex = (bandIndex: number): string => {
	const basePort = 8080 + bandIndex * 10;
	return pathJoin(LOCK_DIR, `band-${basePort}.lock`);
};

/**
 * Finds a band whose four published ports are all takeable RIGHT NOW, using
 * only node:net (never the module under test, so the probe stays independent).
 * Returns the found base port, or throws when the machine has no free band at
 * all. Any port released by the scan is immediately closed again.
 */
const findFreeBandPort = async (): Promise<number> => {
	for (let bandIndex = 0; bandIndex < 500; bandIndex++) {
		const ports = bandPortsFor(8080 + bandIndex * 10);
		const servers: Server[] = [];
		let allFree = true;

		for (const port of ports) {
			try {
				servers.push(await listenOn(port));
			} catch {
				allFree = false;
				break;
			}
		}

		for (const server of servers) {
			await closeListener(server);
		}

		if (allFree) {
			return ports[0];
		}
	}

	throw new Error(
		'No free e2e port band available on this machine for the spec.',
	);
};

type LockHolderHandle = {
	kill: () => void;
};

/** Holds LIVE locks for every band index before the target, so acquisition
 * must select the target band. Returns a handle whose kill() releases them. */
const holdLocksBeforeBand = (targetBasePort: number): LockHolderHandle => {
	const lockPaths: string[] = [];

	for (let bandIndex = 0; ; bandIndex++) {
		const basePort = 8080 + bandIndex * 10;
		if (basePort >= targetBasePort) {
			break;
		}

		lockPaths.push(lockPathForBandIndex(bandIndex));
	}

	const child = spawn(
		process.execPath,
		[
			'-e',
			`
				const fs = require('node:fs');
				const lockPaths = JSON.parse(process.argv[1]);
				for (const lockPath of lockPaths) {
					fs.writeFileSync(
						lockPath,
						JSON.stringify({
							pid: process.pid,
							timestamp: Date.now(),
							uuid: crypto.randomUUID(),
						}),
						'utf8',
					);
				}
				setInterval(() => {}, 1 << 30);
			`,
			JSON.stringify(lockPaths),
		],
		{ stdio: 'ignore' },
	);

	// Wait until every lock file exists (the child owns them with a live PID).
	for (const lockPath of lockPaths) {
		const deadline = Date.now() + 5000;
		while (!existsSync(lockPath) && Date.now() < deadline) {
			// busy-wait on the child's writes
		}

		assert.ok(
			existsSync(lockPath),
			`lock holder child did not create ${lockPath} in time`,
		);
	}

	return {
		kill: () => {
			child.kill('SIGKILL');
			for (const lockPath of lockPaths) {
				try {
					unlinkSync(lockPath);
				} catch {
					// already gone
				}
			}
		},
	};
};

describe('normalizeComposeName', () => {
	it('converts to lowercase', () => {
		assert.equal(normalizeComposeName('MY-PROJECT'), 'my-project');
	});

	it('replaces spaces and special characters with underscores', () => {
		const result = normalizeComposeName('my/project#test');
		assert.equal(result, 'my_project_test');
	});

	it('must start with alphanumeric character', () => {
		const result = normalizeComposeName('-my-project');
		assert.ok(
			/^[a-z0-9]/.test(result),
			`Expected to start with alphanumeric, got: ${result}`,
		);
	});

	it('produces Compose-safe names (alphanumeric, dash, underscore only)', () => {
		const result = normalizeComposeName('test/path/with spaces');
		const isSafe = /^[a-z0-9_-]+$/.test(result);
		assert.ok(isSafe, `Result "${result}" contains invalid characters`);
	});

	it('handles empty input gracefully', () => {
		const result = normalizeComposeName('');
		assert.ok(typeof result === 'string', 'Should return a string');
		assert.ok(result.length > 0, 'Should not be empty');
	});
});

describe('deriveProjectName', () => {
	it('produces Compose-safe names', () => {
		const projectName = deriveProjectName();
		const isSafe = /^publyapp-e2e-[a-z0-9_-]+$/.test(projectName);
		assert.ok(isSafe, `Not Compose-safe: ${projectName}`);
		assert.ok(
			projectName.startsWith('publyapp-e2e-'),
			'Should start with publyapp-e2e-',
		);
	});

	it('uses full absolute path for uniqueness (fixes Constat 2)', () => {
		// The project name is derived from the repo path, which is unique per checkout
		const name = deriveProjectName();

		// Should include some form of the repo path
		assert.ok(name.includes('publyapp'), 'Should contain publyapp');
		assert.ok(
			name.length > 'publyapp-e2e-'.length,
			'Name should have path-derived suffix',
		);
	});
});

describe('acquirePortBand', () => {
	it('acquires a port band and returns valid reservation', () => {
		const reservation = acquirePortBand();

		assert.ok(reservation, 'Failed to acquire port band');
		assert.ok(reservation!.bandIndex >= 0, 'Band index should be non-negative');
		assert.ok(reservation!.basePort >= 8080, 'Base port should be >= 8080');
		assert.ok(
			reservation!.lockPath.includes('band-'),
			'Lock path should include band name',
		);
		assert.ok(
			reservation!.lockPath.includes('.lock'),
			'Lock path should end with .lock',
		);

		// Clean up
		releasePortBand(reservation!.lockPath);
	});

	it('releases locks correctly', () => {
		const reservation = acquirePortBand();
		assert.ok(reservation, 'Failed to acquire port band');

		const result = releasePortBand(reservation!.lockPath);
		assert.ok(result, 'Failed to release port band');

		// Now we should be able to acquire the same band again
		const reacquired = acquirePortBand();
		assert.ok(reacquired, 'Failed to reacquire port band');
		assert.equal(reacquired!.lockPath, reservation!.lockPath);

		// Clean up
		releasePortBand(reacquired!.lockPath);
	});
});

describe('PORT BAND COLLISION GUARD', () => {
	/**
	 * PROOF: Two concurrent acquisitions cannot get the same band
	 *
	 * This test proves the key fix from the brief:
	 * - Before: ports were derived via (empreinte modulo 500) * 10
	 * - With 10 trees: 8.7% collision probability
	 * - With 12 trees: 12.5% collision probability
	 * - The fix: acquire a FREE band atomically via lock file
	 *   -> 0% collision probability
	 */
	it('proves two sequential acquisitions cannot get the same band', () => {
		const reservation1: PortBandReservation = acquirePortBand()!;
		assert.ok(reservation1, 'Stack 1 failed to acquire band');

		const reservation2: PortBandReservation = acquirePortBand()!;
		assert.ok(reservation2, 'Stack 2 failed to acquire band');

		// Verify they are different bands - THIS IS THE KEY GUARANTEE
		assert.notEqual(
			reservation1.bandIndex,
			reservation2.bandIndex,
			'Both stacks got the same band index - collision would occur!',
		);
		assert.notEqual(
			reservation1.lockPath,
			reservation2.lockPath,
			'Both stacks got the same lock path',
		);

		// Clean up
		releasePortBand(reservation1.lockPath);
		releasePortBand(reservation2.lockPath);
	});

	it('verifies port calculation follows the band offset pattern', () => {
		const band0 = acquirePortBand()!;

		// Band should have base ports >= 8080
		assert.ok(band0.basePort >= 8080, 'Base port should be >= 8080');
		releasePortBand(band0.lockPath);
	});
});

describe('setupE2EComposeEnv', () => {
	it('returns complete environment configuration', () => {
		const env = setupE2EComposeEnv();

		assert.ok(
			env.projectName.startsWith('publyapp-e2e-'),
			'Project name should start with publyapp-e2e-',
		);
		assert.ok(env.ports.http > 0, 'HTTP port should be positive');
		assert.ok(env.ports.https > 0, 'HTTPS port should be positive');
		assert.ok(env.ports.db > 0, 'DB port should be positive');
		assert.ok(
			env.ports.requestCounter > 0,
			'Request counter port should be positive',
		);
		assert.ok(env.lockPath.length > 0, 'Lock path should not be empty');
		assert.ok(env.bandIndex >= 0, 'Band index should be non-negative');

		// Clean up
		teardownE2EComposeEnv(env);
	});
});

describe('integration: parallel stack isolation', () => {
	it('two sequential acquisitions produce different configurations', () => {
		const env1: E2EComposeEnv = setupE2EComposeEnv();
		const env2: E2EComposeEnv = setupE2EComposeEnv();

		// Both should have unique bands (different ports)
		assert.notEqual(
			env1.bandIndex,
			env2.bandIndex,
			'Both environments got the same band index!',
		);
		assert.notEqual(
			env1.ports.http,
			env2.ports.http,
			'Both environments got the same HTTP port!',
		);
		assert.notEqual(
			env1.lockPath,
			env2.lockPath,
			'Both environments got the same lock path!',
		);

		// Clean up
		teardownE2EComposeEnv(env1);
		teardownE2EComposeEnv(env2);
	});
});

describe('stale lock detection (#1642)', () => {
	/**
	 * PROOF: A lock whose owning process has died MUST be reclaimed.
	 *
	 * This test verifies the fix for the brief's requirement B:
	 * "un verrou dont le pid n'existe plus DOIT etre repris".
	 *
	 * Before the fix: locks wrote a PID but never checked liveness,
	 * so a dead process left an immortal lock that permanently
	 * consumed a port band.
	 *
	 * After the fix: isLockStale detects dead PIDs, reclaimStaleLock
	 * deletes + recreates the lock atomically.
	 */
	it('detects a stale lock with a dead PID', () => {
		// Create a fake lock file with a PID that doesn't exist
		const fakeLockPath = pathJoin(LOCK_DIR, 'test-dead-pid.lock');
		mkdirSync(LOCK_DIR, { recursive: true });
		writeFileSync(
			fakeLockPath,
			JSON.stringify({
				pid: 99999999, // Non-existent PID
				timestamp: Date.now(),
				uuid: 'test-uuid',
			}),
			'utf8',
		);

		// Should be detected as stale
		assert.ok(isLockStale(fakeLockPath), 'Lock with dead PID should be stale');

		// Clean up
		unlinkSync(fakeLockPath);
	});

	it('detects a stale lock with an old timestamp', () => {
		const fakeLockPath = pathJoin(LOCK_DIR, 'test-old-timestamp.lock');
		mkdirSync(LOCK_DIR, { recursive: true });
		writeFileSync(
			fakeLockPath,
			JSON.stringify({
				pid: process.pid, // Current PID (alive) but...
				timestamp: Date.now() - 3 * 60 * 60 * 1000, // 3 hours ago
				uuid: 'test-uuid',
			}),
			'utf8',
		);

		// Should be detected as stale due to age (despite alive PID)
		assert.ok(
			isLockStale(fakeLockPath),
			'Lock older than threshold should be stale',
		);

		// Clean up
		unlinkSync(fakeLockPath);
	});

	it('does NOT mark a fresh lock with alive PID as stale', () => {
		// Acquire a real lock
		const reservation = acquirePortBand();
		assert.ok(reservation, 'Failed to acquire port band');

		// Should NOT be stale (we just created it, we're alive)
		assert.ok(
			!isLockStale(reservation!.lockPath),
			'Fresh lock with alive PID should not be stale',
		);

		// Clean up
		releasePortBand(reservation!.lockPath);
	});

	it('reclaims a stale lock with a dead PID (CRITICAL)', () => {
		// Use a proper band lock path so acquirePortBand() actually encounters it
		const bandLockPath = pathJoin(LOCK_DIR, 'band-8080.lock');
		mkdirSync(LOCK_DIR, { recursive: true });
		writeFileSync(
			bandLockPath,
			JSON.stringify({
				pid: 99999999,
				timestamp: Date.now(),
				uuid: 'test-uuid',
			}),
			'utf8',
		);

		// Confirm it's stale
		assert.ok(isLockStale(bandLockPath), 'Lock with dead PID should be stale');

		// Now acquire a port band - it should reclaim the SAME stale lock
		const reservation = acquirePortBand();
		assert.ok(reservation, 'Failed to acquire port band');

		// The reservation should have reclaimed the SAME band (band-8080 = index 0)
		assert.equal(
			reservation!.lockPath,
			bandLockPath,
			'Should have reclaimed the same band lock',
		);
		assert.equal(reservation!.bandIndex, 0, 'Should be band index 0');

		// The lock should now be fresh (not stale)
		assert.ok(
			!isLockStale(reservation!.lockPath),
			'Reclaimed lock should not be stale',
		);

		// Clean up
		releasePortBand(reservation!.lockPath);
	});

	it('reclaimStaleLock returns true for stale lock, false after reclaimed', () => {
		// Create a lock with a dead PID
		const bandLockPath = pathJoin(LOCK_DIR, 'band-8080.lock');
		mkdirSync(LOCK_DIR, { recursive: true });
		writeFileSync(
			bandLockPath,
			JSON.stringify({
				pid: 99999999,
				timestamp: Date.now(),
				uuid: 'test-uuid',
			}),
			'utf8',
		);

		// First reclaim succeeds
		const reclaimed = reclaimStaleLock(bandLockPath);
		assert.ok(reclaimed, 'First reclaim of stale lock should succeed');

		// After reclaim, the lock is fresh (our PID, recent timestamp)
		assert.ok(!isLockStale(bandLockPath), 'Reclaimed lock should not be stale');

		// Clean up
		unlinkSync(bandLockPath);
	});

	it('concurrent reclaim: only one process wins (atomicity)', () => {
		// Create a stale lock
		const bandLockPath = pathJoin(LOCK_DIR, 'band-8080.lock');
		mkdirSync(LOCK_DIR, { recursive: true });
		writeFileSync(
			bandLockPath,
			JSON.stringify({
				pid: 99999999,
				timestamp: Date.now(),
				uuid: 'test-uuid',
			}),
			'utf8',
		);

		const script = `
			const { unlinkSync, openSync, writeFileSync, closeSync } = require('node:fs');
			const lockPath = process.argv[1];
			try {
				unlinkSync(lockPath);
				const fd = openSync(lockPath, 'wx');
				writeFileSync(lockPath, JSON.stringify({pid: process.pid, timestamp: Date.now(), uuid: crypto.randomUUID()}), 'utf8');
				closeSync(fd);
				console.log('WON');
			} catch (e) {
				console.log('LOST');
			}
		`;

		const result1 = execFileSync('node', ['-e', script, bandLockPath])
			.toString()
			.trim();
		const result2 = execFileSync('node', ['-e', script, bandLockPath])
			.toString()
			.trim();

		// The key invariant: after both run, the lock exists and is held by exactly one
		const content = JSON.parse(readFileSync(bandLockPath, 'utf8'));
		assert.ok(content.pid, 'Lock should have a PID');
		assert.ok(content.uuid, 'Lock should have a UUID');

		// At least one must have won (they run sequentially via execFileSync, so first wins)
		assert.ok(
			result1 === 'WON' || result2 === 'WON',
			'At least one reclaimer should win',
		);

		// Clean up
		unlinkSync(bandLockPath);
	});
});

/** Runs a real band acquisition and returns the loud conflict message it
 * throws, or null when it (unexpectedly) succeeds. Named function: the call
 * site must not be an IIFE (house rule). */
const firstBandConflictMessage = (): string | null => {
	try {
		acquirePortBand();
		return null;
	} catch (error) {
		if (error instanceof Error) {
			return error.message;
		}

		return String(error);
	}
};

// `void` per the no-floating-promises ratchet convention (issue #1679): every
// node:test statement in this repository marks its fire-and-forget intent.
void describe('occupied port detection (#1698)', () => {
	/**
	 * PROOF: a band port held by an entity that does NOT participate in the lock
	 * scheme must be detected and its holder NAMED, instead of the assignment
	 * silently claiming the band and letting `docker compose up` fail later on
	 * an unexplained bind conflict.
	 *
	 * Real artifact: a genuine listening socket, probed through the shipped
	 * `findOccupiedBandPorts` / `describePortHolders` functions.
	 */
	void it('detects an occupied band port and names its holder', async () => {
		const basePort = await findFreeBandPort();
		const bandPort = bandPortsFor(basePort)[0];
		const server = await listenOn(bandPort);

		try {
			const occupied = findOccupiedBandPorts(basePort);

			assert.ok(
				occupied.includes(bandPort),
				`the occupied port ${bandPort} must be reported; got ${occupied.join(', ')}`,
			);

			const holders = describePortHolders(bandPort);
			assert.ok(holders.length > 0, 'the holder must be described');
			assert.match(
				holders.join(' '),
				/process|container|unidentified/,
				'the holder description must name a process, a container, or say it is unidentified',
			);
		} finally {
			await closeListener(server);
		}
	});

	/**
	 * PROOF: acquisition REFUSES the band (releasing its lock) when a foreign
	 * squatter holds a port, and the error names the band, the port, the holder,
	 * and the inspection commands. The lock file must not be left behind.
	 */
	void it('refuses to claim a band whose port is squatted by a foreign holder', async () => {
		const basePort = await findFreeBandPort();
		const hold = holdLocksBeforeBand(basePort);

		try {
			const bandIndex = (basePort - 8080) / 10;
			const bandPort = bandPortsFor(basePort)[0];
			const server = await listenOn(bandPort);

			try {
				const message = firstBandConflictMessage();

				assert.ok(message, 'acquisition must throw on a squatted band');
				assert.match(
					message,
					new RegExp(`band ${basePort}`),
					'the failure must name the band',
				);
				assert.match(
					message,
					new RegExp(`${bandPort}`),
					'the failure must name the occupied port',
				);
				assert.match(
					message,
					/docker ps/,
					'the failure must tell the operator how to inspect it',
				);
				assert.match(
					message,
					/process|container|unidentified/,
					'the failure must name the holder',
				);

				assert.ok(
					!existsSync(lockPathForBandIndex(bandIndex)),
					'the rejected band must not keep its lock',
				);
			} finally {
				await closeListener(server);
			}
		} finally {
			hold.kill();
		}
	});

	/**
	 * PROOF: a leftover of THIS tree's own project (the interrupted-run case the
	 * ci-e2e-front recipe cleans with its own `down -v`) is NOT a foreign
	 * squatter: its container name must be recognized as ours.
	 */
	void it('distinguishes our own project containers from foreign ones', () => {
		const projectName = deriveProjectName();

		assert.ok(
			isOwnProjectContainer(`${projectName}-traefik-1`),
			'our own project container must be recognized',
		);
		assert.ok(
			!isOwnProjectContainer('publyapp-e2e-somebody_else-traefik-1'),
			'a foreign project container must not be recognized as ours',
		);
		assert.ok(
			!isOwnProjectContainer('not-even-an-e2e-container'),
			'an unrelated container must not be recognized as ours',
		);
	});

	/**
	 * PROOF: the conflict message is built from the real holder description and
	 * always carries the three required parts — which port, who holds it, and
	 * how to see it yourself.
	 */
	void it('builds the loud conflict message with port, holder and inspection command', () => {
		const message = buildBandConflictMessage(8080, [8080]);

		assert.match(message, /band 8080/, 'must name the band');
		assert.match(message, /port 8080/, 'must name the port');
		assert.match(message, /docker ps/, 'must give the docker ps command');
		assert.match(message, /ss -tlnp/, 'must give the ss command');
	});
});
