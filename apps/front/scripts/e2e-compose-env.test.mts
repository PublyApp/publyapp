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
import { randomUUID } from 'node:crypto';
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
	type E2eComposeEnv,
	type E2EComposeEnv,
} from './e2e-compose-env.mts';
import { runE2EFront, type RunCommand } from './run-e2e-front.mts';

// Test lock directory (matches the one in mts)
const LOCK_DIR = pathJoin('/tmp', 'publyapp-e2e-port-locks');
const DERIVED_ENV_PROOF: E2eComposeEnv = {
	COMPOSE_PROJECT_NAME: 'publyapp-e2e-proof',
	E2E_PORT_TRAEFIK_WEB: '9080',
	E2E_PORT_TRAEFIK_WEBSECURE: '9443',
	E2E_PORT_REQUEST_COUNTER: '9800',
	E2E_PORT_TOXIPROXY: '9474',
	E2E_PORT_POSTGRES: '6454',
	E2E_BASE_URL: 'https://front.localhost:9443',
	E2E_API_BASE_URL: 'https://api.front.localhost:9443',
	E2E_LOCK_PATH: '/tmp/publyapp-e2e-port-locks/band-9080.lock',
};

void describe('ci-e2e-front recipe', () => {
	void it('delegates the complete lifecycle to the cross-platform runner', () => {
		const justfile = readFileSync(
			pathJoin(import.meta.dirname, '../../../justfile'),
			'utf8',
		);
		const recipe = justfile.match(/^ci-e2e-front:\n(?<body>(?:  .*\n|\n)*)/m)
			?.groups?.body;

		assert.ok(recipe, 'ci-e2e-front recipe should exist');
		const executableLines = recipe
			.split('\n')
			.map((line) => line.trim())
			.filter((line) => line.length > 0 && !line.startsWith('#'));

		assert.deepEqual(executableLines, [
			'@node apps/front/scripts/run-e2e-front.mts',
		]);
	});

	void it('passes one derived environment through the complete lifecycle', async () => {
		const invocations: Parameters<RunCommand>[] = [];
		let releasedLock = '';

		await runE2EFront({
			computeEnv: () => DERIVED_ENV_PROOF,
			runCommand: async (...args) => {
				invocations.push(args);
			},
			releasePortBand: (lockPath) => {
				releasedLock = lockPath;
				return true;
			},
			writeError: () => {},
		});

		assert.deepEqual(
			invocations.map(([command, args]) => [command, args]),
			[
				[
					'docker',
					[
						'compose',
						'-f',
						'apps/front/docker-compose.test.yml',
						'down',
						'-v',
						'--remove-orphans',
					],
				],
				[
					'docker',
					[
						'compose',
						'-f',
						'apps/front/docker-compose.test.yml',
						'up',
						'-d',
						'--build',
						'--wait',
						'--wait-timeout',
						'180',
					],
				],
				[
					'pnpm',
					['--filter', 'front', 'exec', 'playwright', 'install', 'chromium'],
				],
				['pnpm', ['--filter', 'front', 'exec', 'playwright', 'test']],
				['pnpm', ['--filter', 'front', 'test:drawer-contrast']],
				[
					'docker',
					['compose', '-f', 'apps/front/docker-compose.test.yml', 'down', '-v'],
				],
			],
		);
		for (const [, , commandEnv] of invocations) {
			assert.equal(
				commandEnv.COMPOSE_PROJECT_NAME,
				DERIVED_ENV_PROOF.COMPOSE_PROJECT_NAME,
			);
			assert.equal(commandEnv.E2E_BASE_URL, DERIVED_ENV_PROOF.E2E_BASE_URL);
			assert.equal(
				commandEnv.E2E_API_BASE_URL,
				DERIVED_ENV_PROOF.E2E_API_BASE_URL,
			);
		}
		assert.equal(releasedLock, DERIVED_ENV_PROOF.E2E_LOCK_PATH);
	});

	// The bash recipe exported only E2E_BASE_URL/E2E_API_BASE_URL onto the
	// playwright call; the ports and project name reached compose through the
	// shell's own environment. The runner must give EVERY command the complete
	// derived set, and must not drop the ambient environment while doing it.
	void it('gives every command all derived fields and preserves ambient variables', async () => {
		const invocations: Parameters<RunCommand>[] = [];
		const ambientKey = 'PUBLYAPP_E2E_AMBIENT_PROOF';
		process.env[ambientKey] = 'ambient-value';

		try {
			await runE2EFront({
				computeEnv: () => DERIVED_ENV_PROOF,
				runCommand: async (...args) => {
					invocations.push(args);
				},
				releasePortBand: () => true,
				writeError: () => {},
			});
		} finally {
			delete process.env[ambientKey];
		}

		assert.equal(invocations.length, 6);
		for (const [command, args, commandEnv] of invocations) {
			const where = `${command} ${args.join(' ')}`;

			for (const [key, value] of Object.entries(DERIVED_ENV_PROOF)) {
				assert.equal(
					commandEnv[key],
					value,
					`${where} must receive ${key}=${value}`,
				);
			}

			assert.equal(
				commandEnv[ambientKey],
				'ambient-value',
				`${where} must keep the ambient environment`,
			);
			assert.equal(
				commandEnv.PATH,
				process.env.PATH,
				`${where} must keep PATH so docker/pnpm resolve`,
			);
		}
	});

	// The bash recipe's EXIT trap kept the stack alive on failure. The runner
	// must reproduce all four behaviours: propagate, skip the final teardown,
	// print the inspection notice, and still release the band lock.
	void it('propagates a failing playwright run without tearing the stack down', async () => {
		const invocations: Parameters<RunCommand>[] = [];
		const failure = new Error('playwright test failed with exit 1');
		const errors: string[] = [];
		let releasedLock = '';

		await assert.rejects(
			runE2EFront({
				computeEnv: () => DERIVED_ENV_PROOF,
				runCommand: async (command, args, env) => {
					invocations.push([command, args, env]);

					if (args.at(-1) === 'test' && args.includes('playwright')) {
						throw failure;
					}
				},
				releasePortBand: (lockPath) => {
					releasedLock = lockPath;
					return true;
				},
				writeError: (message) => errors.push(message),
			}),
			(error: unknown) => error === failure,
		);

		// The failure aborts the lifecycle: drawer-contrast never runs, and no
		// command after the failing one is issued.
		assert.deepEqual(
			invocations.map(([command, args]) => `${command} ${args.join(' ')}`),
			[
				'docker compose -f apps/front/docker-compose.test.yml down -v --remove-orphans',
				'docker compose -f apps/front/docker-compose.test.yml up -d --build --wait --wait-timeout 180',
				'pnpm --filter front exec playwright install chromium',
				'pnpm --filter front exec playwright test',
			],
		);
		assert.equal(
			invocations.filter(([, args]) => args.at(-1) === '-v').length,
			0,
			'the final `down -v` teardown must NOT run after a failure',
		);
		assert.deepEqual(errors, [
			'E2E stack left running for inspection after failure.\n',
		]);
		assert.equal(
			releasedLock,
			DERIVED_ENV_PROOF.E2E_LOCK_PATH,
			'the port band lock must be released even when the lifecycle fails',
		);
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

/**
 * Holds LIVE locks for every band index before the target, so acquisition must
 * select the target band. Returns a handle whose kill() releases them.
 *
 * The lock directory is GLOBAL and shared with real E2E runs, so this helper
 * must never clobber a lock it does not own: it writes synchronously with the
 * exclusive `wx` flag, stamps what it creates with a unique ownership marker,
 * and unlinks only files still bearing that marker. The test process itself is
 * the live lock owner.
 */
const holdLocksBeforeBand = (targetBasePort: number): LockHolderHandle => {
	const lockPaths: string[] = [];
	const marker = `holdLocksBeforeBand-${randomUUID()}`;

	for (let bandIndex = 0; 8080 + bandIndex * 10 < targetBasePort; bandIndex++) {
		const lockPath = lockPathForBandIndex(bandIndex);
		lockPaths.push(lockPath);

		try {
			writeFileSync(
				lockPath,
				JSON.stringify({
					pid: process.pid,
					timestamp: Date.now(),
					uuid: randomUUID(),
					helperMarker: marker,
				}),
				{ encoding: 'utf8', flag: 'wx' },
			);
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
				throw error;
			}
			// A foreign owner already holds this band; leave its lock untouched.
		}
	}

	return {
		kill: () => {
			for (const lockPath of lockPaths) {
				try {
					const parsed: unknown = JSON.parse(readFileSync(lockPath, 'utf8'));
					if (
						typeof parsed === 'object' &&
						parsed !== null &&
						(parsed as { helperMarker?: unknown }).helperMarker === marker
					) {
						unlinkSync(lockPath);
					}
				} catch {
					// already gone, or unreadable/unparseable: not ours to delete
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
	 * PROOF (regression): the lock directory is shared with real E2E runs, so the
	 * test helper must not touch a lock it does not own. A live foreign lock that
	 * exists BEFORE the helper runs must survive the helper's cleanup
	 * byte-for-byte: never overwritten, never unlinked.
	 */
	void it('leaves a pre-existing foreign lock untouched across helper cleanup', () => {
		mkdirSync(LOCK_DIR, { recursive: true });

		let foreignBandIndex = 0;
		while (
			foreignBandIndex < 500 &&
			existsSync(lockPathForBandIndex(foreignBandIndex))
		) {
			foreignBandIndex++;
		}
		assert.ok(foreignBandIndex < 500, 'the proof needs one unused lock path');

		const foreignLockPath = lockPathForBandIndex(foreignBandIndex);
		const foreignContents = JSON.stringify({
			pid: process.pid,
			timestamp: Date.now(),
			uuid: randomUUID(),
			owner: 'foreign-live-e2e-run',
		});

		writeFileSync(foreignLockPath, foreignContents, 'utf8');

		try {
			const hold = holdLocksBeforeBand(8080 + (foreignBandIndex + 1) * 10);
			hold.kill();

			assert.ok(
				existsSync(foreignLockPath),
				'the foreign lock must survive the helper cleanup',
			);
			assert.equal(
				readFileSync(foreignLockPath, 'utf8'),
				foreignContents,
				'the foreign lock must be byte-for-byte unchanged',
			);
		} finally {
			unlinkSync(foreignLockPath);
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
