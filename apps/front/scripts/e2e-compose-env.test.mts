/**
 * Tests for e2e-compose-env.mts
 *
 * These tests verify:
 * 1. Port band allocation is guaranteed (no collisions)
 * 2. Project name derivation uses absolute path (not directory name)
 * 3. Name normalization is Compose-safe
 */

import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import {
	mkdirSync,
	mkdtempSync,
	rmSync,
	writeFileSync,
	readdirSync,
	readFileSync,
	existsSync,
} from 'node:fs';
import { createServer, type Server } from 'node:net';
import { tmpdir } from 'node:os';
import { join as pathJoin } from 'node:path';
import { describe, it } from 'node:test';

import {
	acquireLockDir,
	acquirePortBand,
	bandPortsFor,
	buildBandConflictMessage,
	DEFAULT_LOCK_ROOT,
	describePortHolders,
	deriveProjectName,
	findOccupiedBandPorts,
	getLockFilePath,
	isOwnProjectContainer,
	normalizeComposeName,
	readLockOwner,
	releasePortBand,
	setupE2EComposeEnv,
	teardownE2EComposeEnv,
	isLockStale,
	reclaimStaleLock,
	type LockOwner,
	type PortBandReservation,
	type E2eComposeEnv,
	type E2EComposeEnv,
} from './e2e-compose-env.mts';
import { runE2EFront, type RunCommand } from './run-e2e-front.mts';

/** A private lock root for one spec, removed when the spec ends. */
const makeLockRoot = (): string =>
	mkdtempSync(pathJoin(tmpdir(), 'publyapp-e2e-lock-root-'));

/** Runs `callback` against a fresh private lock root, always removing it. */
const withPrivateLockRoot = async (
	callback: (lockRoot: string) => void | Promise<void>,
): Promise<void> => {
	const root = makeLockRoot();

	try {
		await callback(root);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
};
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
	E2E_LOCK_TOKEN: 'derived-env-proof-token',
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
					[
						'compose',
						'-f',
						'apps/front/docker-compose.test.yml',
						'down',
						'-v',
						'--remove-orphans',
					],
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

	// The bash recipe's EXIT trap kept the stack alive on failure, which strands
	// containers holding the band's ports. Teardown is now UNCONDITIONAL: a
	// failing run still propagates its error and still releases the band, but it
	// also tears the stack down instead of leaving a corpse for the next run to
	// collide with.
	void it('tears the stack down and releases the band when playwright fails', async () => {
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

		// The failure aborts the LIFECYCLE (drawer-contrast never runs), but the
		// teardown still follows it.
		assert.deepEqual(
			invocations.map(([command, args]) => `${command} ${args.join(' ')}`),
			[
				'docker compose -f apps/front/docker-compose.test.yml down -v --remove-orphans',
				'docker compose -f apps/front/docker-compose.test.yml up -d --build --wait --wait-timeout 180',
				'pnpm --filter front exec playwright install chromium',
				'pnpm --filter front exec playwright test',
				'docker compose -f apps/front/docker-compose.test.yml down -v --remove-orphans',
			],
		);
		assert.deepEqual(
			errors,
			[],
			'the stack is no longer left running, so nothing announces that it is',
		);
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

/**
 * The lock file path for a band index, ALWAYS inside a caller-supplied private
 * root. There is deliberately no default: a helper that silently fell back to
 * the production root is precisely how a spec ends up unlinking a live e2e
 * run's reservation.
 */
const lockPathForBandIndex = (bandIndex: number, lockRoot: string): string =>
	getLockFilePath(bandIndex, lockRoot);

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
 * Holds LIVE locks for every band index before the target INSIDE `lockRoot`, so
 * acquisition against that same private root must select the target band.
 * Returns a handle whose kill() releases them.
 *
 * These specs exercise the REAL port-conflict path (real sockets on the real
 * band ports), but the LOCKS still live in the spec's private root: the port
 * probe and the lock bookkeeping are independent, so nothing forces the shared
 * production root on this helper.
 */
const holdLocksBeforeBand = (
	targetBasePort: number,
	lockRoot: string,
): LockHolderHandle => {
	const held: Array<{ lockPath: string; token: string }> = [];

	mkdirSync(lockRoot, { recursive: true });

	for (let bandIndex = 0; 8080 + bandIndex * 10 < targetBasePort; bandIndex++) {
		const lockPath = lockPathForBandIndex(bandIndex, lockRoot);
		const token = acquireLockDir(lockPath);

		// A null token means somebody else already holds this band: leave its
		// lock strictly untouched.
		if (token !== null) {
			held.push({ lockPath, token });
		}
	}

	return {
		kill: () => {
			for (const { lockPath, token } of held) {
				releasePortBand(lockPath, token);
			}
		},
	};
};

void describe('normalizeComposeName', () => {
	void it('converts to lowercase', () => {
		assert.equal(normalizeComposeName('MY-PROJECT'), 'my-project');
	});

	void it('replaces spaces and special characters with underscores', () => {
		const result = normalizeComposeName('my/project#test');
		assert.equal(result, 'my_project_test');
	});

	void it('must start with alphanumeric character', () => {
		const result = normalizeComposeName('-my-project');
		assert.ok(
			/^[a-z0-9]/.test(result),
			`Expected to start with alphanumeric, got: ${result}`,
		);
	});

	void it('produces Compose-safe names (alphanumeric, dash, underscore only)', () => {
		const result = normalizeComposeName('test/path/with spaces');
		const isSafe = /^[a-z0-9_-]+$/.test(result);
		assert.ok(isSafe, `Result "${result}" contains invalid characters`);
	});

	void it('handles empty input gracefully', () => {
		const result = normalizeComposeName('');
		assert.ok(typeof result === 'string', 'Should return a string');
		assert.ok(result.length > 0, 'Should not be empty');
	});
});

void describe('deriveProjectName', () => {
	void it('produces Compose-safe names', () => {
		const projectName = deriveProjectName();
		const isSafe = /^publyapp-e2e-[a-z0-9_-]+$/.test(projectName);
		assert.ok(isSafe, `Not Compose-safe: ${projectName}`);
		assert.ok(
			projectName.startsWith('publyapp-e2e-'),
			'Should start with publyapp-e2e-',
		);
	});

	void it('uses full absolute path for uniqueness (fixes Constat 2)', () => {
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

void describe('acquirePortBand', () => {
	void it('acquires a port band and returns valid reservation', async () =>
		withPrivateLockRoot(async (root) => {
			const reservation = acquirePortBand(root);

			assert.ok(reservation, 'Failed to acquire port band');
			assert.ok(
				reservation!.bandIndex >= 0,
				'Band index should be non-negative',
			);
			assert.ok(reservation!.basePort >= 8080, 'Base port should be >= 8080');
			assert.ok(
				reservation!.lockPath.includes('band-'),
				'Lock path should include band name',
			);
			assert.ok(
				reservation!.lockPath.includes('.lock'),
				'Lock path should end with .lock',
			);

			releasePortBand(reservation!.lockPath, reservation!.token);
		}));
});

/**
 * The ownership half of the protocol. Every spec here uses a PRIVATE lock
 * root: the production root is shared with live e2e runs, and a test that
 * writes or unlinks inside it can destroy a real run's reservation.
 */
void describe('lock ownership protocol', () => {
	void it('never writes into the shared production lock root', async () =>
		withPrivateLockRoot(async (root) => {
			const reservation = acquirePortBand(root);
			assert.ok(reservation, 'Failed to acquire port band in private root');
			assert.ok(
				reservation!.lockPath.startsWith(root),
				`the lock must live in the private root; got ${reservation!.lockPath}`,
			);
			assert.equal(
				reservation!.lockPath.startsWith(DEFAULT_LOCK_ROOT),
				false,
				'a spec must never take a lock in the production root',
			);
			releasePortBand(reservation!.lockPath, reservation!.token);
		}));

	void it('releases a band and mints a distinct token on every reacquisition', async () =>
		withPrivateLockRoot(async (root) => {
			const first = acquirePortBand(root)!;
			assert.equal(typeof first.token, 'string');
			assert.ok(first.token.length > 0, 'the token must be a real value');
			assert.equal(
				readLockOwner(first.lockPath)?.token,
				first.token,
				'the on-disk record must carry the token handed to the caller',
			);

			assert.ok(
				releasePortBand(first.lockPath, first.token),
				'the owner must be able to release its own band',
			);
			assert.equal(existsSync(first.lockPath), false, 'the lock is gone');

			const second = acquirePortBand(root)!;
			assert.equal(second.lockPath, first.lockPath, 'same band reacquired');
			assert.notEqual(
				second.token,
				first.token,
				'each acquisition must mint a fresh token',
			);
			releasePortBand(second.lockPath, second.token);
		}));

	/**
	 * ADVERSARIAL PROOF (the release side of the same invariant): a holder of an
	 * OLD or simply WRONG token cannot release the lock a LATER owner holds.
	 *
	 * `releaseLockDir` reads the owner record and then renames — a
	 * read-then-act sequence that is only safe because a live owner can never
	 * be reclaimed (see `isLockStale`: liveness, never age). This spec attacks
	 * the successor's lock from three directions, and the successor must
	 * survive all of them with its record byte-for-byte intact.
	 */
	void it('cannot release a later owner with an old or forged token', async () =>
		withPrivateLockRoot(async (root) => {
			const lockPath = pathJoin(root, 'band-8080.lock');

			// Generation 1 acquires and is superseded.
			const firstToken = acquireLockDir(lockPath)!;
			assert.ok(releasePortBand(lockPath, firstToken));

			// Generation 2 is the live owner from here on.
			const secondToken = acquireLockDir(lockPath)!;
			const liveOwner = readLockOwner(lockPath);
			assert.notEqual(secondToken, firstToken);

			const forbidden: Array<[string, string]> = [
				["generation 1's superseded token", firstToken],
				['a forged random token', randomUUID()],
				['an empty token', ''],
			];

			for (const [what, token] of forbidden) {
				assert.equal(
					releasePortBand(lockPath, token),
					false,
					`${what} must not release the live lock`,
				);
				assert.ok(existsSync(lockPath), `the live lock must survive ${what}`);
				assert.deepEqual(
					readLockOwner(lockPath),
					liveOwner,
					`the live owner record must be intact after ${what}`,
				);
			}

			// And the true owner still can.
			assert.ok(
				releasePortBand(lockPath, secondToken),
				'the current owner must still be able to release',
			);
			assert.equal(existsSync(lockPath), false);
		}));

	/**
	 * ADVERSARIAL PROOF (the reclamation side): a late reclaimer that observed
	 * a now-gone stale lock must not delete the FRESH owner that took the path
	 * afterwards.
	 *
	 * The race this reproduces deterministically: A and B both see the same
	 * dead owner; A reclaims and releases; C acquires the free path; B finally
	 * runs. Under a bare rename-aside protocol B's rename lands on C's live
	 * lock and destroys it. Under the transition-marker protocol B's marker
	 * belongs to the directory it OBSERVED, not to the path, so B stops.
	 */
	void it('does not let a late stale reclaimer delete a fresh owner', async () =>
		withPrivateLockRoot(async (root) => {
			const lockPath = pathJoin(root, 'band-8080.lock');
			plantLock(lockPath, {
				pid: 99999999, // dead
				timestamp: Date.now(),
				token: randomUUID(),
			});

			// Reclaimer A wins and then hands the band back.
			const reclaimed = reclaimStaleLock(lockPath)!;
			assert.ok(reclaimed, 'the first reclaimer must win');
			assert.ok(releasePortBand(lockPath, reclaimed));

			// Fresh contender C takes the now-free path.
			const freshToken = acquireLockDir(lockPath)!;
			const freshOwner = readLockOwner(lockPath);
			assert.ok(freshToken, 'the fresh contender must acquire the free band');

			// Late reclaimer B finally runs against the SAME path.
			assert.equal(
				reclaimStaleLock(lockPath),
				null,
				'a late reclaimer must not reclaim a band held by a live fresh owner',
			);
			assert.ok(
				existsSync(lockPath),
				"the fresh owner's lock must still exist",
			);
			assert.deepEqual(
				readLockOwner(lockPath),
				freshOwner,
				"the fresh owner's record must be untouched by the late reclaimer",
			);
			assert.ok(
				releasePortBand(lockPath, freshToken),
				'the fresh owner must still hold a releasable lock',
			);
		}));

	/**
	 * PROOF: there is no window in which a lock is visible but unidentifiable.
	 * The previous protocol did `openSync(path, 'wx')` and only THEN wrote the
	 * content, so a concurrent reader could see an empty file and judge the
	 * live lock stale. The staging-directory rename removes that window: the
	 * owner record exists before the lock becomes visible at all.
	 */
	void it('publishes a lock only once its owner record is complete', async () =>
		withPrivateLockRoot(async (root) => {
			const lockPath = pathJoin(root, 'band-8080.lock');
			const token = acquireLockDir(lockPath);

			assert.ok(token, 'the first acquisition must win');
			const owner = readLockOwner(lockPath);
			assert.ok(owner, 'a visible lock must always have a readable owner');
			assert.equal(owner!.token, token);
			assert.equal(owner!.pid, process.pid);
			assert.equal(
				isLockStale(lockPath),
				false,
				'a freshly published lock must never look stale',
			);

			assert.equal(
				acquireLockDir(lockPath),
				null,
				'a second acquisition of a held lock must lose',
			);
		}));

	void it('leaves no staging or aside directories behind', async () =>
		withPrivateLockRoot(async (root) => {
			const held = acquirePortBand(root)!;
			assert.ok(releasePortBand(held.lockPath, held.token));

			const leftovers = readdirSync(root);
			assert.deepEqual(
				leftovers,
				[],
				`the protocol must clean up after itself; found: ${leftovers.join(', ')}`,
			);
		}));
});

void describe('PORT BAND COLLISION GUARD', () => {
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
	void it('proves two sequential acquisitions cannot get the same band', async () =>
		withPrivateLockRoot(async (root) => {
			const reservation1: PortBandReservation = acquirePortBand(root)!;
			assert.ok(reservation1, 'Stack 1 failed to acquire band');

			const reservation2: PortBandReservation = acquirePortBand(root)!;
			assert.ok(reservation2, 'Stack 2 failed to acquire band');

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

			releasePortBand(reservation1.lockPath, reservation1.token);
			releasePortBand(reservation2.lockPath, reservation2.token);
		}));
});

void describe('setupE2EComposeEnv', () => {
	void it('returns complete environment configuration', async () =>
		withPrivateLockRoot(async (root) => {
			const env = setupE2EComposeEnv(root);

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

			teardownE2EComposeEnv(env);
		}));
});

void describe('integration: parallel stack isolation', () => {
	void it('two sequential acquisitions produce different configurations', async () =>
		withPrivateLockRoot(async (root) => {
			const env1: E2EComposeEnv = setupE2EComposeEnv(root);
			const env2: E2EComposeEnv = setupE2EComposeEnv(root);

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

			teardownE2EComposeEnv(env1);
			teardownE2EComposeEnv(env2);
		}));
});

/**
 * Writes a lock directory directly, bypassing acquisition, so a spec can plant
 * a specific owner record (a dead PID, an ancient timestamp) inside its own
 * private root.
 */
const plantLock = (lockPath: string, owner: LockOwner): void => {
	mkdirSync(lockPath, { recursive: true });
	writeFileSync(
		pathJoin(lockPath, 'owner.json'),
		JSON.stringify(owner),
		'utf8',
	);
};

void describe('stale lock detection (#1642)', () => {
	/**
	 * PROOF: A lock whose owning process has died MUST be reclaimed.
	 *
	 * Before the fix: locks wrote a PID but never checked liveness, so a dead
	 * process left an immortal lock that permanently consumed a port band.
	 */
	void it('detects a stale lock with a dead PID', async () =>
		withPrivateLockRoot(async (root) => {
			const lockPath = pathJoin(root, 'test-dead-pid.lock');
			plantLock(lockPath, {
				pid: 99999999, // Non-existent PID
				timestamp: Date.now(),
				token: randomUUID(),
			});

			assert.ok(isLockStale(lockPath), 'Lock with dead PID should be stale');
		}));

	/**
	 * PROOF: age is NOT an override. A lock whose owner is ALIVE must stay
	 * un-reclaimable no matter how old it is. The previous rule ("older than 2
	 * hours is stale regardless of PID") let a long-running e2e stack — or one
	 * on a machine that had been suspended — have its band stolen while it was
	 * still bound to the ports, and left its own later release racing the
	 * successor's lock. Wall-clock time says nothing about a process.
	 */
	void it('never treats an ancient lock with a LIVE owner as stale', async () =>
		withPrivateLockRoot(async (root) => {
			const lockPath = pathJoin(root, 'test-old-timestamp.lock');
			const liveToken = randomUUID();
			plantLock(lockPath, {
				pid: process.pid, // alive
				timestamp: Date.now() - 72 * 60 * 60 * 1000, // three days old
				token: liveToken,
			});

			assert.equal(
				isLockStale(lockPath),
				false,
				'a live owner must never become stale through mere elapsed time',
			);
			assert.equal(
				reclaimStaleLock(lockPath),
				null,
				'an ancient but LIVE lock must not be reclaimable',
			);
			assert.equal(
				readLockOwner(lockPath)?.token,
				liveToken,
				"the live owner's record must be untouched",
			);
		}));

	void it('treats an unreadable owner record as stale', async () =>
		withPrivateLockRoot(async (root) => {
			// A lock directory with no owner record at all: it cannot be proven
			// live, so it must never consume a band forever.
			const lockPath = pathJoin(root, 'test-corrupt.lock');
			mkdirSync(lockPath, { recursive: true });

			assert.equal(readLockOwner(lockPath), null);
			assert.ok(isLockStale(lockPath), 'an unidentifiable lock is stale');
		}));

	void it('does NOT mark a fresh lock with alive PID as stale', async () =>
		withPrivateLockRoot(async (root) => {
			const reservation = acquirePortBand(root);
			assert.ok(reservation, 'Failed to acquire port band');
			assert.ok(
				!isLockStale(reservation!.lockPath),
				'Fresh lock with alive PID should not be stale',
			);
			releasePortBand(reservation!.lockPath, reservation!.token);
		}));

	void it('reclaims a stale lock with a dead PID (CRITICAL)', async () =>
		withPrivateLockRoot(async (root) => {
			const bandLockPath = getLockFilePath(0, root);
			plantLock(bandLockPath, {
				pid: 99999999,
				timestamp: Date.now(),
				token: randomUUID(),
			});

			assert.ok(
				isLockStale(bandLockPath),
				'Lock with dead PID should be stale',
			);

			// Acquisition must reclaim that SAME band rather than skipping it.
			const reservation = acquirePortBand(root);
			assert.ok(reservation, 'Failed to acquire port band');
			assert.equal(
				reservation!.lockPath,
				bandLockPath,
				'Should have reclaimed the same band lock',
			);
			assert.equal(reservation!.bandIndex, 0, 'Should be band index 0');
			assert.ok(
				!isLockStale(reservation!.lockPath),
				'Reclaimed lock should not be stale',
			);

			releasePortBand(reservation!.lockPath, reservation!.token);
		}));

	void it('reclaimStaleLock mints a fresh token and supersedes the dead owner', async () =>
		withPrivateLockRoot(async (root) => {
			const bandLockPath = getLockFilePath(0, root);
			const deadToken = randomUUID();
			plantLock(bandLockPath, {
				pid: 99999999,
				timestamp: Date.now(),
				token: deadToken,
			});

			const token = reclaimStaleLock(bandLockPath);
			assert.ok(token, 'First reclaim of stale lock should succeed');
			assert.notEqual(token, deadToken, 'reclaim must mint a fresh token');
			assert.equal(readLockOwner(bandLockPath)?.token, token);
			assert.ok(
				!isLockStale(bandLockPath),
				'Reclaimed lock should not be stale',
			);

			// The dead owner's token must no longer authorise anything.
			assert.equal(
				releasePortBand(bandLockPath, deadToken),
				false,
				"the dead owner's token must not release the reclaimed lock",
			);

			assert.ok(releasePortBand(bandLockPath, token!));
		}));
});

/**
 * Genuine concurrency proofs: N separate OS processes, released from a shared
 * barrier, all racing for the SAME lock path.
 *
 * The previous "concurrent" test ran two `execFileSync` calls one after the
 * other and asserted "at least one won" — with sequential execution and that
 * assertion, a protocol with NO mutual exclusion at all would pass. These
 * specs assert EXACTLY ONE winner, and that the winner's token is the one
 * recorded on disk.
 */
const RACE_HARNESS = pathJoin(
	import.meta.dirname,
	'e2e-compose-env.lock-race-harness.mts',
);

type RaceResult = {
	result: 'won' | 'lost';
	token?: string;
	recordedToken?: string | null;
	pid?: number;
};

/** Polls `predicate` until it holds, or throws after `timeoutMs`. */
const waitUntil = async (
	predicate: () => boolean,
	timeoutMs: number,
	what: string,
): Promise<void> => {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		if (predicate()) {
			return;
		}
		await new Promise((resolveDelay) => setTimeout(resolveDelay, 25));
	}

	throw new Error(`timed out after ${String(timeoutMs)}ms waiting for ${what}`);
};

/**
 * Spawns `contenders` harness processes at once; each blocks on a filesystem
 * barrier until all have arrived, so they enter the lock protocol together.
 *
 * The winner deliberately stays ALIVE after announcing its win (its exit would
 * make the surviving lock instantly stale through a dead PID). `inspect` runs
 * while the winner is still holding a genuinely live lock; only afterwards does
 * this helper drop the release file that lets the winner exit.
 */
const raceForLock = async (
	mode: 'acquire' | 'reclaim',
	lockPath: string,
	contenders: number,
	inspect: (results: RaceResult[]) => void,
): Promise<void> => {
	const barrierDir = `${lockPath}.barrier-${randomUUID()}`;
	const releaseFile = pathJoin(barrierDir, 'release');
	const announced: RaceResult[] = [];

	const runs = Array.from({ length: contenders }, (_unused, index) => {
		return new Promise<void>((resolveRun, rejectRun) => {
			const child = execFile(
				process.execPath,
				[
					RACE_HARNESS,
					mode,
					lockPath,
					barrierDir,
					String(contenders),
					String(index),
				],
				{ timeout: 60_000 },
				(error) => {
					if (error) {
						rejectRun(new Error(`contender ${index} failed: ${error.message}`));
						return;
					}
					resolveRun();
				},
			);

			// A winner announces and then blocks, so the verdict must be read from
			// the stream as it arrives, never from the process's final output.
			child.stdout?.setEncoding('utf8');
			child.stdout?.on('data', (chunk: string) => {
				for (const line of chunk.split('\n')) {
					if (line.trim().length > 0) {
						announced.push(JSON.parse(line) as RaceResult);
					}
				}
			});
		});
	});

	try {
		await waitUntil(
			() => announced.length >= contenders,
			60_000,
			'every contender to announce its verdict',
		);

		// Inspected while the winner is still alive and still owns the lock.
		inspect(announced);
	} finally {
		mkdirSync(barrierDir, { recursive: true });
		writeFileSync(releaseFile, '1', 'utf8');
		await Promise.all(runs);
		rmSync(barrierDir, { recursive: true, force: true });
	}
};

void describe('lock protocol under real concurrency', () => {
	const CONTENDERS = 8;

	void it('gives a free lock to exactly one of many simultaneous acquirers', async () =>
		withPrivateLockRoot(async (root) => {
			const lockPath = getLockFilePath(0, root);

			await raceForLock('acquire', lockPath, CONTENDERS, (results) => {
				const winners = results.filter((entry) => entry.result === 'won');
				assert.equal(
					winners.length,
					1,
					`exactly one contender may hold the band; ${String(
						winners.length,
					)} did: ${JSON.stringify(results)}`,
				);

				const winner = winners[0];
				const owner = readLockOwner(lockPath);
				assert.equal(
					owner?.token,
					winner.token,
					"the on-disk owner must be the winner's token",
				);
				assert.equal(
					owner?.pid,
					winner.pid,
					"the on-disk owner must be the winner's still-live process",
				);
				assert.equal(
					winner.recordedToken,
					winner.token,
					'the winner must be able to read back its own ownership record',
				);
				// The winner is still running, so this is a real liveness verdict
				// rather than an artefact of a contender that already exited.
				assert.equal(
					isLockStale(lockPath),
					false,
					'the surviving lock must be live while its winner still holds it',
				);
			});
		}));

	/**
	 * PROOF: stale reclamation is exclusive. Under the old check/unlink/create
	 * sequence, several processes could all judge the same lock stale, all
	 * unlink (each deleting the previous winner's brand-new lock), and more
	 * than one could believe it had reclaimed the band.
	 */
	void it('lets exactly one of many simultaneous reclaimers take a stale lock', async () =>
		withPrivateLockRoot(async (root) => {
			const lockPath = getLockFilePath(0, root);
			const deadToken = randomUUID();
			plantLock(lockPath, {
				pid: 99999999,
				timestamp: Date.now(),
				token: deadToken,
			});
			assert.ok(isLockStale(lockPath), 'the planted lock must start stale');

			await raceForLock('reclaim', lockPath, CONTENDERS, (results) => {
				const winners = results.filter((entry) => entry.result === 'won');
				assert.equal(
					winners.length,
					1,
					`exactly one reclaimer may win; ${String(
						winners.length,
					)} did: ${JSON.stringify(results)}`,
				);

				const winner = winners[0];
				assert.notEqual(
					winner.token,
					deadToken,
					'a fresh token must be minted',
				);

				// The winner is still alive, so "not stale" here proves the reclaimed
				// lock genuinely belongs to a running owner — and, because every
				// loser is still blocked too, that no late reclaimer deleted it.
				const owner = readLockOwner(lockPath);
				assert.equal(
					owner?.token,
					winner.token,
					'the surviving lock must belong to the single reclaim winner',
				);
				assert.equal(
					owner?.pid,
					winner.pid,
					"the surviving lock must record the winner's live PID",
				);
				assert.equal(
					isLockStale(lockPath),
					false,
					'the reclaimed lock must be live, not left stale or half-written',
				);
			});
		}));
});

/** Runs a real band acquisition against `lockRoot` and returns the loud
 * conflict message it throws, or null when it (unexpectedly) succeeds. Named
 * function: the call site must not be an IIFE (house rule). */
const firstBandConflictMessage = (lockRoot: string): string | null => {
	try {
		acquirePortBand(lockRoot);
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
		const root = makeLockRoot();
		const basePort = await findFreeBandPort();
		const hold = holdLocksBeforeBand(basePort, root);

		try {
			const bandIndex = (basePort - 8080) / 10;
			const bandPort = bandPortsFor(basePort)[0];
			const server = await listenOn(bandPort);

			try {
				const message = firstBandConflictMessage(root);

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
					!existsSync(lockPathForBandIndex(bandIndex, root)),
					'the rejected band must not keep its lock',
				);
			} finally {
				await closeListener(server);
			}
		} finally {
			hold.kill();
			rmSync(root, { recursive: true, force: true });
		}
	});

	/**
	 * PROOF (regression): the helper must not touch a lock it does not own. A
	 * live foreign lock that exists BEFORE the helper runs must survive the
	 * helper's cleanup byte-for-byte: never overwritten, never unlinked.
	 *
	 * The foreign lock is planted in the spec's PRIVATE root. Using the shared
	 * production root here would be the very defect this file guards against:
	 * a spec must never create or unlink an entry a real e2e run may be using.
	 */
	void it('leaves a pre-existing foreign lock untouched across helper cleanup', async () =>
		withPrivateLockRoot(async (root) => {
			const foreignBandIndex = 0;
			const foreignLockPath = lockPathForBandIndex(foreignBandIndex, root);
			// A foreign live run, taken through the real protocol; its token is one
			// the helper has never seen and therefore must never act on.
			const foreignToken = acquireLockDir(foreignLockPath);
			assert.ok(
				foreignToken,
				'the proof needs to hold the foreign lock itself',
			);
			const foreignOwner = readLockOwner(foreignLockPath);

			const hold = holdLocksBeforeBand(
				8080 + (foreignBandIndex + 1) * 10,
				root,
			);
			hold.kill();

			assert.ok(
				existsSync(foreignLockPath),
				'the foreign lock must survive the helper cleanup',
			);
			assert.deepEqual(
				readLockOwner(foreignLockPath),
				foreignOwner,
				'the foreign owner record must be unchanged',
			);
		}));

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
