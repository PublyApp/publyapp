#!/usr/bin/env node
/**
 * Derives per-worktree Compose project name and host port offsets for the
 * front e2e stack (apps/front/docker-compose.test.yml).
 *
 * Problem (#1642): docker-compose.test.yml had a hardcoded
 * `name: publyapp-front2-real-test`, so Compose indexed on that name — not
 * on the file path. Every worktree on the machine drove the SAME containers,
 * and a `down -v` from one tree destroyed another tree's stack (volumes
 * included).
 *
 * Solution (voie A — isolation garantie): uses lock DIRECTORIES to ensure
 * that no two stacks can obtain the same port band, even when launched
 * simultaneously. See `acquireLockDir` for the protocol: a fully populated
 * staging directory is `rename`d into place, so a lock never exists in a
 * half-written state and its owner record is readable the instant it is
 * visible.
 *
 * Stale lock recovery: a lock whose owning process has died (crash, kill,
 * host reboot) is detected by a PID liveness check — and by that alone. Age
 * is never an override: a lock whose owner is ALIVE is never reclaimable, no
 * matter how long the run has taken. Reclamation is serialised by a
 * transition marker created inside the observed lock directory, so a late
 * reclaimer can never rename a FRESH owner's lock aside (see
 * `reclaimStaleLock`).
 *
 * This script emits shell `export` lines that can be `eval`'d, or sets
 * environment variables when invoked with `--set`.
 *
 * PORT BANDS:
 * - Each band provides ports for all services: HTTP, HTTPS, DB, Request Counter, Toxiproxy
 * - Bands are allocated sequentially starting from 8080
 * - 500 bands available (8080 to 13070 for the base HTTP port)
 * - Probability of collision: 0% (vs 8.7% with hashed approach at 10 trees)
 *
 * PROJECT NAME:
 * - Derived from the absolute path of the repository root
 * - NOT from the directory name (which causes collisions)
 * - Normalized to Compose-safe characters (lowercase, digits, dash, underscore)
 */

import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import {
	mkdirSync,
	readFileSync,
	renameSync,
	rmSync,
	statSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import {
	dirname,
	join as pathJoin,
	dirname as pathDirname,
	resolve,
} from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Base paths
const REPO_ROOT = resolve(__dirname, '..', '..');

// Canonical e2e hostname
const E2E_FRONT_HOST = 'front.localhost';
const E2E_API_HOST = 'api.front.localhost';

// Base ports (must match docker-compose.test.yml's `:8080`, `:8443`, `:8800`, `:8474`)
const BASE_PORTS = {
	traefik_web: 8080,
	traefik_websecure: 8443,
	request_counter: 8800,
	toxiproxy: 8474,
	postgres: 5454,
};

// The ports docker-compose.test.yml actually PUBLISHES on the host. The
// Postgres service is internal-only (`Host=postgres;Port=5432` inside the
// compose network) — `E2E_PORT_POSTGRES` is emitted for symmetry but never
// bound, so it must NOT be probed: probing it would false-positive on any
// machine running `just dev-db` (host 5454) and break band 0 for everyone.
const PUBLISHED_BASE_PORTS = {
	traefik_web: BASE_PORTS.traefik_web,
	traefik_websecure: BASE_PORTS.traefik_websecure,
	request_counter: BASE_PORTS.request_counter,
	toxiproxy: BASE_PORTS.toxiproxy,
};

// Band configuration: 500 bands, 10 ports apart to avoid collisions
const PORT_BAND = 10;
const MAX_BANDS = 500;

// How long a holder-identification probe (docker ps / ss -tlnp) may take before
// the assignment gives up. Every external command is bounded — none may hang the
// band acquisition forever.
const HOLDER_PROBE_TIMEOUT_MS = 3000;

// Lock directory for port band reservations. Every lock-aware function takes
// the root as an argument so a test can point at its own private root and
// never write (or unlink) inside the shared production one.
export const DEFAULT_LOCK_ROOT = pathJoin(tmpdir(), 'publyapp-e2e-port-locks');

/**
 * The owner record written inside a lock directory. `token` is the ownership
 * proof: only the holder of that exact value may release the lock, so a
 * process can never unlink a lock that a later owner has since acquired.
 */
export type LockOwner = {
	pid: number;
	timestamp: number;
	token: string;
};

/** The file, inside a lock directory, that carries the owner record. */
const OWNER_FILE = 'owner.json';

/**
 * The directory, created INSIDE an observed stale lock, that elects the single
 * reclaimer allowed to rename that lock aside. See `reclaimStaleLock`.
 */
const TRANSITION_MARKER = 'reclaiming';

/**
 * Normalizes a string to be Compose-safe:
 * - Lowercase
 * - Only alphanumeric, dash, underscore
 * - Must start with alphanumeric
 */
export const normalizeComposeName = (name: string): string => {
	let normalized = name
		.toLowerCase()
		.replace(/[^a-z0-9_-]/g, '_')
		.replace(/^[^a-z0-9]+/, '');

	// Ensure it starts with alphanumeric
	if (!/^[a-z0-9]/.test(normalized)) {
		normalized = 'n' + normalized;
	}

	return normalized || 'default';
};

/**
 * Finds the repository root (contains .git directory)
 */
const findRepoRoot = (): string => {
	let dir = REPO_ROOT;

	// Walk up the directory tree looking for .git
	while (dir !== '/') {
		try {
			const gitDir = pathJoin(dir, '.git');
			if (statSync(gitDir).isDirectory() || statSync(gitDir).isFile()) {
				return dir;
			}
		} catch {
			// Continue walking up
		}
		dir = pathDirname(dir);
	}

	return REPO_ROOT;
};

/**
 * The lock path for a band, inside `lockRoot`. The `.lock` suffix is kept for
 * continuity, but the entry is a DIRECTORY (see `acquireLockDir`).
 */
export const getLockFilePath = (
	bandIndex: number,
	lockRoot: string = DEFAULT_LOCK_ROOT,
): string => {
	const basePort = BASE_PORTS.traefik_web + bandIndex * PORT_BAND;
	return pathJoin(lockRoot, `band-${basePort}.lock`);
};

/**
 * The host ports a band PUBLISHES (the same offsets docker-compose.test.yml
 * binds): Web/Websecure/Request-counter/Toxiproxy. The Postgres service is
 * internal to the compose network and never bound on the host, so it is
 * deliberately absent — probing it would flag `just dev-db`'s host 5454 as a
 * squatter and block band 0 on every dev machine.
 */
export const bandPortsFor = (basePort: number): number[] => {
	const offset = basePort - BASE_PORTS.traefik_web;
	return Object.values(PUBLISHED_BASE_PORTS).map((port) => port + offset);
};

/**
 * Synchronously probes which of the band's ports are already occupied, by
 * binding them from a short-lived child node process. Node has no synchronous
 * listen(), so the probe is out-of-process: a tiny script tries to bind each
 * port and prints the occupied ones. EADDRINUSE while actively LISTENing is
 * the exact condition that makes `docker compose up` fail later — this is what
 * the assignment must discover BEFORE claiming the band.
 *
 * When the probe itself fails (timeout, no node), the caller must fail loudly
 * rather than guess: an undecidable entry is a loud failure (house rule).
 */
export const findOccupiedBandPorts = (basePort: number): number[] => {
	const ports = bandPortsFor(basePort);

	const probeScript = `
		const net = require('node:net');
		const ports = JSON.parse(process.argv[1]);
		const occupied = [];
		let remaining = ports.length;
		function finish() {
			console.log(JSON.stringify(occupied.sort((a, b) => a - b)));
			process.exit(0);
		}
		for (const port of ports) {
			const server = net.createServer();
			server.once('error', (error) => {
				if (error && error.code === 'EADDRINUSE') {
					occupied.push(port);
				}
				server.close();
				remaining -= 1;
				if (remaining === 0) {
					finish();
				}
			});
			server.listen(port, () => {
				server.close(() => {
					remaining -= 1;
					if (remaining === 0) {
						finish();
					}
				});
			});
		}
	`;

	try {
		const output = execFileSync(
			process.execPath,
			['-e', probeScript, JSON.stringify(ports)],
			{
				timeout: HOLDER_PROBE_TIMEOUT_MS,
				encoding: 'utf8',
				stdio: ['ignore', 'pipe', 'pipe'],
			},
		);

		return JSON.parse(output.trim()) as number[];
	} catch {
		throw new Error(
			`Could not verify band ${basePort}'s ports are free: the port probe failed. ` +
				'Inspect the ports yourself before starting the stack: ' +
				'docker ps ; ss -tlnp',
		);
	}
};

/**
 * Best-effort human-readable identification of who occupies `port`: a docker
 * container publishing it, or the process listening on it (via ss -tlnp), or a
 * plain statement that no identity is visible. Empty when the port is free.
 * Both probes are bounded; a probe failure degrades to "unknown" rather than
 * hiding the conflict — the port occupancy itself was already proven above.
 */
export const describePortHolders = (port: number): string[] => {
	const holders: string[] = [];

	try {
		const dockerOut = execFileSync(
			'docker',
			['ps', '--format', '{{.Names}}\t{{.Ports}}'],
			{ timeout: HOLDER_PROBE_TIMEOUT_MS, encoding: 'utf8' },
		);

		for (const line of dockerOut.split('\n')) {
			if (!line.includes(`:${port}->`)) {
				continue;
			}

			const [name, ports] = line.split('\t', 2);
			if (name) {
				holders.push(`container \`${name}\` (${ports ?? 'port published'})`);
			}
		}
	} catch {
		// docker missing/unavailable: fall through to ss, then to "unknown".
	}

	try {
		const ssOut = execFileSync('ss', ['-tlnp'], {
			timeout: HOLDER_PROBE_TIMEOUT_MS,
			encoding: 'utf8',
		});
		const portPattern = new RegExp(`:${port}\\s`);

		for (const line of ssOut.split('\n')) {
			if (!portPattern.test(line)) {
				continue;
			}

			const match = line.match(/users:\s*\(\("([^"]+)",pid=(\d+)/);
			if (match) {
				holders.push(`process \`${match[1]}\` (pid ${match[2]})`);
			}
		}
	} catch {
		// ss missing/unavailable: degrade to "unknown" below.
	}

	if (holders.length === 0) {
		holders.push(
			'an unidentified holder (run `docker ps` / `ss -tlnp` as root for the process name)',
		);
	}

	return holders;
};

/**
 * Splits the occupied ports of a band into the ones held by a FOREIGN entity
 * (a process, an unidentified holder, or another project's container). A port
 * whose every holder is a container of THIS tree's own project is not foreign:
 * those are leftovers of an interrupted run of the same tree, which the
 * ci-e2e-front recipe removes itself. The remaining (foreign) ports are the
 * defect #1698 must name.
 */
const foreignBandPorts = (occupiedPorts: number[]): number[] => {
	const foreignPorts: number[] = [];

	for (const port of occupiedPorts) {
		const holders = describePortHolders(port);
		const allHoldersAreOwnContainers = holders.every((holder) => {
			const match = holder.match(/container `([^`]+)`/);

			return match !== null && isOwnProjectContainer(match[1]);
		});

		if (!allHoldersAreOwnContainers) {
			foreignPorts.push(port);
		}
	}

	return foreignPorts;
};

/**
 * The loud, plain-words failure the band assignment throws when a band's ports
 * are occupied by an entity that does not participate in the lock scheme —
 * which port, who holds it, and how to see it yourself (issue #1698). A free
 * lock proves nothing about the ports: the lock guards band CLAIMS, not the
 * sockets themselves.
 */
export const buildBandConflictMessage = (
	basePort: number,
	occupiedPorts: number[],
): string => {
	const lines: string[] = [
		`Port band ${basePort} is NOT free for this e2e stack: ${occupiedPorts.length} ` +
			'of its ports are already in use by an entity that holds no lock for the band:',
	];

	for (const port of occupiedPorts) {
		for (const holder of describePortHolders(port)) {
			lines.push(`  - port ${port} is taken by ${holder}`);
		}
	}

	lines.push(
		'A leftover or legacy stack (or a stray process) is squatting these ports; the ' +
			'lock-free port conflict would otherwise surface only as a silent `docker ' +
			'compose up` bind failure. See it yourself with:',
		'  docker ps',
		'  ss -tlnp',
	);

	return lines.join('\n');
};

/**
 * Whether a container name belongs to THIS tree's e2e project. The compose
 * container names are `{project}-{service}-{index}` with the project derived
 * from the absolute repo path, so a leading match identifies a leftover of an
 * interrupted run of the SAME tree — which the ci-e2e-front recipe removes
 * with its own `down -v` before `up`. A foreign project (or a plain process)
 * is never tolerated.
 */
export const isOwnProjectContainer = (containerName: string): boolean => {
	return containerName.startsWith(`${deriveProjectName()}-`);
};
/**
 * Check if a PID is still alive.
 * Uses process.kill(pid, 0) which checks existence without sending a signal.
 */
const isPidAlive = (pid: number): boolean => {
	try {
		process.kill(pid, 0);
		return true;
	} catch (e) {
		// ESRCH = no such process (dead)
		// EPERM = exists but no permission (alive)
		const code = (e as NodeJS.ErrnoException).code;
		return code === 'EPERM';
	}
};

/**
 * Reads the owner record of a lock directory, or null when the lock does not
 * exist (or carries no readable record). Because the record is written into a
 * staging directory BEFORE that directory is renamed into place, a visible
 * lock always has a complete record: there is no empty-file window in which a
 * concurrent reader would mistake a lock being created for a corrupt one.
 */
export const readLockOwner = (lockPath: string): LockOwner | null => {
	try {
		const parsed: unknown = JSON.parse(
			readFileSync(pathJoin(lockPath, OWNER_FILE), 'utf8'),
		);

		if (typeof parsed !== 'object' || parsed === null) {
			return null;
		}

		const { pid, timestamp, token } = parsed as Partial<LockOwner>;
		if (
			typeof pid !== 'number' ||
			typeof timestamp !== 'number' ||
			typeof token !== 'string'
		) {
			return null;
		}

		return { pid, timestamp, token };
	} catch {
		return null;
	}
};

/**
 * Builds a fully populated staging directory and atomically moves it to
 * `lockPath`. `rename` onto an existing DIRECTORY fails with ENOTEMPTY/EEXIST
 * on every supported platform, so exactly one of N concurrent contenders can
 * win — and the winner's lock is complete from the instant it becomes visible.
 *
 * Returns the ownership token on success, or null when another contender got
 * there first. The token, not the path, is what authorises a later release.
 */
export const acquireLockDir = (lockPath: string): string | null => {
	const token = randomUUID();
	// The staging directory is a sibling, so the rename stays on one filesystem
	// (a cross-device rename is not atomic and would fall back to a copy).
	const staging = `${lockPath}.staging-${String(process.pid)}-${token}`;

	try {
		mkdirSync(staging, { recursive: true });
		const owner: LockOwner = { pid: process.pid, timestamp: Date.now(), token };
		writeFileSync(pathJoin(staging, OWNER_FILE), JSON.stringify(owner), 'utf8');
	} catch {
		rmSync(staging, { recursive: true, force: true });
		return null;
	}

	try {
		renameSync(staging, lockPath);
		return token;
	} catch {
		// Someone else holds the band; never leave the staging directory behind.
		rmSync(staging, { recursive: true, force: true });
		return null;
	}
};

/**
 * Whether a lock may be reclaimed: its owner record is unreadable, or the
 * recorded PID is dead. Staleness is a LIVENESS question only.
 *
 * There is deliberately no age override. A "a lock older than N hours is
 * stale regardless of PID" rule makes a LIVE owner reclaimable: a long e2e
 * run (or a machine suspended overnight) would have its band stolen while it
 * is still using the ports, and its own later release would then be racing a
 * successor's lock. Wall-clock time is not evidence about a process.
 */
export const isLockStale = (lockPath: string): boolean => {
	const owner = readLockOwner(lockPath);
	if (owner === null) {
		// A lock we cannot identify cannot be proven live: treat it as stale so a
		// corrupt entry can never consume a band forever.
		return true;
	}

	return !isPidAlive(owner.pid);
};

/**
 * Reclaim a stale lock, returning the new ownership token or null.
 *
 * Renaming the observed lock aside is NOT safe on its own. Two reclaimers, A
 * and B, can both observe the same dead owner; A renames it aside and a fresh
 * contender C acquires the now-free path; B's rename then lands on C's brand
 * new lock and destroys a live reservation.
 *
 * The fix is to make the right to rename belong to the observed lock DIRECTORY
 * rather than to the path:
 *
 *  1. `mkdir` a fixed transition marker INSIDE the observed lock. `mkdir` is
 *     atomic and exclusive, so exactly one reclaimer wins it; losers stop.
 *  2. Re-read the owner after winning. If it is no longer the token we judged
 *     stale, or that owner is alive again, the directory is not the one we
 *     observed: abandon the reclamation.
 *  3. Only then rename the directory aside and acquire the band afresh.
 *
 * A late reclaimer whose observed lock was already renamed aside by the winner
 * creates its marker inside the RENAMED-ASIDE directory (its `mkdir` follows
 * the same inode), not inside whatever fresh lock now sits at the path — so it
 * can never rename a new owner's lock away. The marker winner may itself lose
 * the fresh acquisition in step 3, which is correct: losing a band is safe,
 * deleting somebody's live lock is not.
 *
 * Residual, stated rather than papered over: a reclaimer that dies between
 * winning the marker and renaming aside leaves that ONE band unreclaimable.
 * The acquisition loop simply moves to the next of 500 bands, and the lock
 * root is disposable state under the system temp dir (`rm -rf` it to reset).
 * A "take the marker over when its holder looks dead" step would reintroduce
 * exactly the multiple-winner race this marker exists to remove, so it is
 * deliberately absent.
 */
export const reclaimStaleLock = (lockPath: string): string | null => {
	const observed = readLockOwner(lockPath);

	try {
		// Exclusive by construction: mkdir without `recursive` fails with EEXIST
		// when the marker is already there, so only one reclaimer proceeds.
		mkdirSync(pathJoin(lockPath, TRANSITION_MARKER));
	} catch {
		// Another reclaimer owns the transition, or the lock vanished.
		return null;
	}

	// Re-read through the marker we now hold: the directory cannot have been
	// renamed aside by anyone else, because that right is what the marker is.
	const confirmed = readLockOwner(lockPath);
	const stillTheObservedLock =
		(observed === null && confirmed === null) ||
		(observed !== null &&
			confirmed !== null &&
			confirmed.token === observed.token);

	const confirmedIsAlive = confirmed !== null && isPidAlive(confirmed.pid);

	if (!stillTheObservedLock || confirmedIsAlive) {
		// Not the entry we judged stale (or its owner is alive after all): leave
		// it strictly alone, marker and all.
		return null;
	}

	const asidePath = `${lockPath}.stale-${String(process.pid)}-${randomUUID()}`;
	try {
		renameSync(lockPath, asidePath);
	} catch {
		return null;
	}

	rmSync(asidePath, { recursive: true, force: true });

	// The band is now free, but a third party may claim it before we do — so
	// the fresh acquisition still goes through the same atomic protocol.
	return acquireLockDir(lockPath);
};

/**
 * Releases a lock ONLY when `token` still matches the recorded owner.
 *
 * Ownership verification is what stops a slow process from deleting a lock a
 * later owner acquired after its own was reclaimed as stale: the token changes
 * on every acquisition, so a stale holder's release is a no-op that returns
 * false instead of silently freeing a live band.
 */
const releaseLockDir = (lockPath: string, token: string): boolean => {
	const owner = readLockOwner(lockPath);
	if (owner === null || owner.token !== token) {
		return false;
	}

	// Rename-then-remove: the entry disappears from the band path in one atomic
	// step, so no contender can observe a partially removed lock directory.
	const asidePath = `${lockPath}.released-${String(process.pid)}-${randomUUID()}`;
	try {
		renameSync(lockPath, asidePath);
	} catch {
		return false;
	}

	rmSync(asidePath, { recursive: true, force: true });
	return true;
};

/**
 * Ensure the lock root exists
 */
const ensureLockDirExists = (lockRoot: string): void => {
	try {
		mkdirSync(lockRoot, { recursive: true });
	} catch {
		// Directory already exists or couldn't create
	}
};

/**
 * Acquires a port band, returning the reservation INCLUDING its ownership
 * token. The token travels with the reservation all the way to the release:
 * releasing a band requires proving you still own it (see `releaseLockDir`).
 */
const acquirePortBandInternal = (
	lockRoot: string = DEFAULT_LOCK_ROOT,
): PortBandReservation | null => {
	ensureLockDirExists(lockRoot);

	for (let bandIndex = 0; bandIndex < MAX_BANDS; bandIndex++) {
		const lockPath = getLockFilePath(bandIndex, lockRoot);

		// One atomic attempt; on failure the band may be held by a live owner or
		// by a dead one, and only the latter may be reclaimed.
		let token = acquireLockDir(lockPath);

		if (token === null && isLockStale(lockPath)) {
			token = reclaimStaleLock(lockPath);
		}

		if (token === null) {
			// Lock exists and couldn't be reclaimed, try next band
			continue;
		}

		const basePort = BASE_PORTS.traefik_web + bandIndex * PORT_BAND;

		// Issue #1698: a lock alone proves nothing about the sockets. A stack
		// that never joined the lock scheme (a leftover of the legacy hardcoded
		// name, or a stray process) can occupy every port of the band while its
		// lock file sits free. Detect it BEFORE returning the band, and name it.
		const occupiedPorts = findOccupiedBandPorts(basePort);

		if (occupiedPorts.length > 0) {
			const foreignHolders = foreignBandPorts(occupiedPorts);

			if (foreignHolders.length > 0) {
				// Not ours to clean up: hand the lock back and fail loudly with
				// the holder's name and the commands to inspect it yourself.
				releaseLockDir(lockPath, token);
				throw new Error(buildBandConflictMessage(basePort, foreignHolders));
			}

			// Every occupant is a leftover of THIS tree's own project: the
			// ci-e2e-front recipe's `down -v` (which runs right after this
			// eval) removes our own stack before `up`, so claiming the band is
			// safe. Warn, do not fail — a foreign squatter is the defect, our
			// own interrupted run is not.
			process.stderr.write(
				`e2e-compose-env: band ${basePort} is held by THIS tree's own leftover ` +
					'containers; the caller is expected to `docker compose down -v` them ' +
					'before starting the stack.\n',
			);
		}

		return { bandIndex, basePort, lockPath, token };
	}

	return null;
};

/**
 * Derives a unique project name from the repository root path
 * (NOT from the worktree name which causes collisions)
 */
export const deriveProjectName = (): string => {
	const repoPath = findRepoRoot();
	const normalized = normalizeComposeName(repoPath);
	return `publyapp-e2e-${normalized}`;
};

/**
 * Compute environment variables for the e2e stack
 */
/** The exact set of environment variables the e2e stack needs. Closed on purpose:
 * an open dictionary would let a typo introduce a variable nothing consumes. */
export type E2eComposeEnv = {
	COMPOSE_PROJECT_NAME: string;
	E2E_PORT_TRAEFIK_WEB: string;
	E2E_PORT_TRAEFIK_WEBSECURE: string;
	E2E_PORT_REQUEST_COUNTER: string;
	E2E_PORT_TOXIPROXY: string;
	E2E_PORT_POSTGRES: string;
	E2E_BASE_URL: string;
	E2E_API_BASE_URL: string;
	E2E_LOCK_PATH: string;
	/**
	 * The ownership proof for `E2E_LOCK_PATH`. It must be handed back to the
	 * release: a release without the current token is refused, so a run whose
	 * lock was reclaimed as stale can never free the band its successor holds.
	 */
	E2E_LOCK_TOKEN: string;
};

export const computeEnv = (
	lockRoot: string = DEFAULT_LOCK_ROOT,
): E2eComposeEnv => {
	// Acquire a port band
	const band = acquirePortBandInternal(lockRoot);

	if (!band) {
		throw new Error(
			`Could not acquire port band. All ${MAX_BANDS} bands are in use. ` +
				`Start another instance of the e2e stack? Or wait and retry.`,
		);
	}

	const { basePort, lockPath, token } = band;
	const offset = basePort - BASE_PORTS.traefik_web;
	const projectName = deriveProjectName();

	return {
		COMPOSE_PROJECT_NAME: projectName,
		E2E_PORT_TRAEFIK_WEB: String(BASE_PORTS.traefik_web + offset),
		E2E_PORT_TRAEFIK_WEBSECURE: String(BASE_PORTS.traefik_websecure + offset),
		E2E_PORT_REQUEST_COUNTER: String(BASE_PORTS.request_counter + offset),
		E2E_PORT_TOXIPROXY: String(BASE_PORTS.toxiproxy + offset),
		E2E_PORT_POSTGRES: String(BASE_PORTS.postgres + offset),
		E2E_BASE_URL: `https://${E2E_FRONT_HOST}:${BASE_PORTS.traefik_websecure + offset}`,
		E2E_API_BASE_URL: `https://${E2E_API_HOST}:${BASE_PORTS.traefik_websecure + offset}`,
		E2E_LOCK_PATH: lockPath,
		E2E_LOCK_TOKEN: token,
	};
};

/**
 * Release the port band lock (for cleanup). Both the path AND the ownership
 * token must be present: without the token there is no way to prove the lock
 * still belongs to this process, and an unverified unlink is the bug this
 * protocol exists to prevent.
 */
export const releaseLock = (): boolean => {
	const lockPath = process.env.E2E_LOCK_PATH;
	const token = process.env.E2E_LOCK_TOKEN;
	if (!lockPath || !token) {
		return false;
	}

	return releaseLockDir(lockPath, token);
};

/**
 * A held band: where the lock lives, and the token proving we hold it.
 */
export type PortBandReservation = {
	bandIndex: number;
	basePort: number;
	lockPath: string;
	token: string;
};

export type E2EComposeEnv = {
	projectName: string;
	ports: {
		http: number;
		https: number;
		db: number;
		requestCounter: number;
	};
	lockPath: string;
	token: string;
	bandIndex: number;
};

/**
 * Acquire a port band. `lockRoot` defaults to the shared production root; a
 * test passes its own so it can never write into (or unlink from) that one.
 */
export const acquirePortBand: (
	lockRoot?: string,
) => PortBandReservation | null = acquirePortBandInternal;

/**
 * Release a port band, proving ownership with the token from its acquisition.
 * This is the single exported name for the release; `releaseLockDir` above is
 * its internal implementation, not a second public alias for the same
 * function.
 */
export const releasePortBand: (lockPath: string, token: string) => boolean =
	releaseLockDir;

/**
 * Setup complete e2e environment (exported for testing)
 */
export const setupE2EComposeEnv = (
	lockRoot: string = DEFAULT_LOCK_ROOT,
): E2EComposeEnv => {
	const env = computeEnv(lockRoot);

	// Extract values from environment
	const httpPort = Number.parseInt(env.E2E_PORT_TRAEFIK_WEB, 10);
	const httpsPort = Number.parseInt(env.E2E_PORT_TRAEFIK_WEBSECURE, 10);
	const dbPort = Number.parseInt(env.E2E_PORT_POSTGRES, 10);
	const requestCounterPort = Number.parseInt(env.E2E_PORT_REQUEST_COUNTER, 10);

	// Calculate band index from lock path
	const lockPath = env.E2E_LOCK_PATH;
	const match = lockPath.match(/band-(\d+)\.lock$/);
	const bandIndex = match
		? (Number.parseInt(match[1], 10) - BASE_PORTS.traefik_web) / PORT_BAND
		: 0;

	return {
		projectName: env.COMPOSE_PROJECT_NAME,
		ports: {
			http: httpPort,
			https: httpsPort,
			db: dbPort,
			requestCounter: requestCounterPort,
		},
		lockPath: lockPath,
		token: env.E2E_LOCK_TOKEN,
		bandIndex: bandIndex,
	};
};

/**
 * Teardown e2e environment (exported for testing)
 */
export const teardownE2EComposeEnv = (env: E2EComposeEnv): boolean => {
	if (!env.lockPath || !env.token) {
		return false;
	}

	return releaseLockDir(env.lockPath, env.token);
};

const main = (): void => {
	const env = computeEnv();
	const isSet = process.argv.includes('--set');

	if (isSet) {
		// Print as export statements for shell eval
		for (const [key, value] of Object.entries(env)) {
			process.stdout.write(`${key}=${value}\n`);
		}
	} else {
		// Print as shell export lines
		for (const [key, value] of Object.entries(env)) {
			// Quote if contains special chars
			if (/[^a-zA-Z0-9_]/.test(value)) {
				process.stdout.write(`export ${key}="${value}"\n`);
			} else {
				process.stdout.write(`export ${key}=${value}\n`);
			}
		}
	}
};

// Only run the CLI when this file IS the entry point. The tests import the
// module to call its functions; an unconditional main() at import time acquired
// a port band (printed export lines into the test output) and — since #1698 —
// threw on a squatted band before the suite could even load.
const isMainModule = (): boolean => {
	if (process.argv[1] === undefined) {
		return false;
	}

	try {
		return fileURLToPath(import.meta.url) === resolve(process.argv[1]);
	} catch {
		return false;
	}
};

if (isMainModule()) {
	main();
}
