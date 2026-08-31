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
 * Solution (voie A — isolation garantie): uses file-based locks to ensure
 * that no two stacks can obtain the same port band, even when launched
 * simultaneously. A lock file is created atomically using O_EXCL.
 *
 * Stale lock recovery: a lock whose owning process has died (crash, kill,
 * host reboot) is detected via PID liveness check and age threshold, then
 * reclaimed atomically — the reclaimer deletes the stale lock and recreates
 * it with O_EXCL, so two simultaneous reclaimers cannot both succeed.
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
import { mkdirSync } from 'node:fs';
import {
	readFileSync,
	writeFileSync,
	unlinkSync,
	statSync,
	openSync,
	closeSync,
} from 'node:fs';
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

// Lock directory for port band reservations
const LOCK_DIR = pathJoin('/tmp', 'publyapp-e2e-port-locks');

// Stale lock detection: a lock older than this is considered stale regardless of PID
const STALE_LOCK_THRESHOLD_MS = 2 * 60 * 60 * 1000; // 2 hours

type LockContent = {
	pid?: number;
	timestamp?: number;
	uuid?: string;
};

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
 * Get the lock file path for a given port band
 */
const getLockFilePath = (bandIndex: number): string => {
	const basePort = BASE_PORTS.traefik_web + bandIndex * PORT_BAND;
	return pathJoin(LOCK_DIR, `band-${basePort}.lock`);
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
 * Parse lock file content.
 */
const readLockContent = (lockPath: string): LockContent | null => {
	try {
		const content = readFileSync(lockPath, 'utf8');
		return JSON.parse(content) as LockContent;
	} catch {
		return null;
	}
};

/**
 * Check if a lock is stale (owner dead or too old).
 * Exported for testing.
 */
export const isLockStale = (lockPath: string): boolean => {
	const data = readLockContent(lockPath);
	if (!data) {
		// Can't read lock content - consider it stale
		return true;
	}

	// Check age first - if too old, definitely stale (handles PID reuse)
	if (data.timestamp) {
		const age = Date.now() - data.timestamp;
		if (age > STALE_LOCK_THRESHOLD_MS) {
			return true;
		}
	}

	// Check PID liveness
	if (data.pid && isPidAlive(data.pid)) {
		return false; // Owner is alive
	}

	// PID is dead or missing
	return true;
};

/**
 * Reclaim a stale lock atomically.
 *
 * Strategy: delete the stale lock, then immediately recreate it with O_EXCL.
 * If another process also reclaims the same lock, only one O_EXCL succeeds;
 * the other gets EEXIST and must move on.
 *
 * Returns true if the lock was successfully reclaimed.
 * Exported for testing.
 */
export const reclaimStaleLock = (lockPath: string): boolean => {
	try {
		// Delete the stale lock
		unlinkSync(lockPath);
	} catch {
		// Already deleted by another process
		return false;
	}

	try {
		// Immediately recreate atomically
		const fd = openSync(lockPath, 'wx');
		const lockContent = JSON.stringify({
			pid: process.pid,
			timestamp: Date.now(),
			uuid: crypto.randomUUID(),
		});
		writeFileSync(lockPath, lockContent, 'utf8');
		closeSync(fd);
		return true;
	} catch {
		// Another process created the file first
		return false;
	}
};

/**
 * Ensure lock directory exists
 */
const ensureLockDirExists = (): void => {
	try {
		mkdirSync(LOCK_DIR, { recursive: true });
	} catch {
		// Directory already exists or couldn't create
	}
};

/**
 * Acquire a port band atomically using exclusive file creation
 * Returns lockPath as part of the result
 */
const acquirePortBandInternal = (): {
	bandIndex: number;
	basePort: number;
	lockPath: string;
} | null => {
	ensureLockDirExists();

	for (let bandIndex = 0; bandIndex < MAX_BANDS; bandIndex++) {
		const lockPath = getLockFilePath(bandIndex);
		let lockAcquired = false;

		try {
			// Try to create the lock file exclusively (O_EXCL)
			const fd = openSync(lockPath, 'wx');

			// Write a unique identifier to the lock
			const lockContent = JSON.stringify({
				pid: process.pid,
				timestamp: Date.now(),
				uuid: crypto.randomUUID(),
			});

			writeFileSync(lockPath, lockContent, 'utf8');
			closeSync(fd);
			lockAcquired = true;
		} catch {
			// Lock file exists - check if it's stale and can be reclaimed
			if (isLockStale(lockPath) && reclaimStaleLock(lockPath)) {
				// Successfully reclaimed the stale lock
				lockAcquired = true;
			}
		}

		if (!lockAcquired) {
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
				releasePortBandInternal(lockPath);
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

		return { bandIndex, basePort, lockPath };
	}

	return null;
};

/**
 * Release a port band lock
 */
const releasePortBandInternal = (lockPath: string): boolean => {
	try {
		unlinkSync(lockPath);
		return true;
	} catch {
		return false;
	}
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
};

export const computeEnv = (): E2eComposeEnv => {
	// Acquire a port band
	const band = acquirePortBandInternal();

	if (!band) {
		throw new Error(
			`Could not acquire port band. All ${MAX_BANDS} bands are in use. ` +
				`Start another instance of the e2e stack? Or wait and retry.`,
		);
	}

	const { basePort, lockPath } = band;
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
	};
};

/**
 * Release the port band lock (for cleanup)
 */
export const releaseLock = (): void => {
	// Read lock path from env if set
	const lockPath = process.env.E2E_LOCK_PATH;
	if (lockPath) {
		releasePortBandInternal(lockPath);
	}
};

/**
 * Types exported for testing
 */
export type PortBandReservation = {
	bandIndex: number;
	basePort: number;
	lockPath: string;
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
	bandIndex: number;
};

/**
 * Acquire a port band atomically using exclusive file creation
 * Exported for testing
 */
export const acquirePortBand: () => PortBandReservation | null =
	acquirePortBandInternal;

/**
 * Release port band
 * Exported for testing
 */
export const releasePortBand: (lockPath: string) => boolean =
	releasePortBandInternal;

/**
 * Setup complete e2e environment (exported for testing)
 */
export const setupE2EComposeEnv = (): E2EComposeEnv => {
	const env = computeEnv();

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
		bandIndex: bandIndex,
	};
};

/**
 * Teardown e2e environment (exported for testing)
 */
export const teardownE2EComposeEnv = (env: E2EComposeEnv): void => {
	if (env.lockPath) {
		releasePortBandInternal(env.lockPath);
	}
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
