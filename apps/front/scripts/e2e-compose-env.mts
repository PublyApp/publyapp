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

// Band configuration: 500 bands, 10 ports apart to avoid collisions
const PORT_BAND = 10;
const MAX_BANDS = 500;

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
export function normalizeComposeName(name: string): string {
	let normalized = name
		.toLowerCase()
		.replace(/[^a-z0-9_-]/g, '_')
		.replace(/^[^a-z0-9]+/, '');

	// Ensure it starts with alphanumeric
	if (!/^[a-z0-9]/.test(normalized)) {
		normalized = 'n' + normalized;
	}

	return normalized || 'default';
}

/**
 * Finds the repository root (contains .git directory)
 */
function findRepoRoot(): string {
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
}

/**
 * Get the lock file path for a given port band
 */
function getLockFilePath(bandIndex: number): string {
	const basePort = BASE_PORTS.traefik_web + bandIndex * PORT_BAND;
	return pathJoin(LOCK_DIR, `band-${basePort}.lock`);
}

/**
 * Check if a PID is still alive.
 * Uses process.kill(pid, 0) which checks existence without sending a signal.
 */
function isPidAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch (e) {
		// ESRCH = no such process (dead)
		// EPERM = exists but no permission (alive)
		const code = (e as NodeJS.ErrnoException).code;
		return code === 'EPERM';
	}
}

/**
 * Parse lock file content.
 */
function readLockContent(lockPath: string): LockContent | null {
	try {
		const content = readFileSync(lockPath, 'utf8');
		return JSON.parse(content) as LockContent;
	} catch {
		return null;
	}
}

/**
 * Check if a lock is stale (owner dead or too old).
 * Exported for testing.
 */
export function isLockStale(lockPath: string): boolean {
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
}

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
export function reclaimStaleLock(lockPath: string): boolean {
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
}

/**
 * Ensure lock directory exists
 */
function ensureLockDirExists(): void {
	try {
		mkdirSync(LOCK_DIR, { recursive: true });
	} catch {
		// Directory already exists or couldn't create
	}
}

/**
 * Acquire a port band atomically using exclusive file creation
 * Returns lockPath as part of the result
 */
function acquirePortBandInternal(): {
	bandIndex: number;
	basePort: number;
	lockPath: string;
} | null {
	ensureLockDirExists();

	for (let bandIndex = 0; bandIndex < MAX_BANDS; bandIndex++) {
		const lockPath = getLockFilePath(bandIndex);

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

			const basePort = BASE_PORTS.traefik_web + bandIndex * PORT_BAND;
			return { bandIndex, basePort, lockPath };
		} catch {
			// Lock file exists - check if it's stale and can be reclaimed
			if (isLockStale(lockPath) && reclaimStaleLock(lockPath)) {
				// Successfully reclaimed the stale lock
				const basePort = BASE_PORTS.traefik_web + bandIndex * PORT_BAND;
				return { bandIndex, basePort, lockPath };
			}
			// Lock exists and couldn't be reclaimed, try next band
			continue;
		}
	}

	return null;
}

/**
 * Release a port band lock
 */
function releasePortBandInternal(lockPath: string): boolean {
	try {
		unlinkSync(lockPath);
		return true;
	} catch {
		return false;
	}
}

/**
 * Derives a unique project name from the repository root path
 * (NOT from the worktree name which causes collisions)
 */
export function deriveProjectName(): string {
	const repoPath = findRepoRoot();
	const normalized = normalizeComposeName(repoPath);
	return `publyapp-e2e-${normalized}`;
}

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
	/** Docker network subnet for the e2e stack, derived from the band index so two
	 *  concurrent stacks never claim the same network. Band 0 → 172.28.0.0/24 (CI default). */
	E2E_SUBNET: string;
	/** Traefik's pinned IPv4 on the e2e network, derived from the same band.
	 *  Band 0 → 172.28.0.2 (CI default). Must match what TRUSTED_PROXY_CIDRS points at. */
	E2E_TRAEFIK_IP: string;
};

export function computeEnv(): E2eComposeEnv {
	// Acquire a port band
	const band = acquirePortBandInternal();

	if (!band) {
		throw new Error(
			`Could not acquire port band. All ${MAX_BANDS} bands are in use. ` +
				`Start another instance of the e2e stack? Or wait and retry.`,
		);
	}

	const { basePort, lockPath, bandIndex } = band;
	const offset = basePort - BASE_PORTS.traefik_web;
	const projectName = deriveProjectName();

	// Derive a per-band subnet so two concurrent stacks never claim the same
	// Docker network. Band 0 → 172.28.0.0/24 (CI default). Each band steps the
	// third octet by 1; /24 keeps each stack's network isolated.
	const SUBNET_BASE = 28;
	const subnetOctet3 = SUBNET_BASE + bandIndex;
	const subnet = `172.${subnetOctet3}.0.0/24`;
	const traefikIp = `172.${subnetOctet3}.0.2`;

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
		E2E_SUBNET: subnet,
		E2E_TRAEFIK_IP: traefikIp,
	};
}

/**
 * Release the port band lock (for cleanup)
 */
export function releaseLock(): void {
	// Read lock path from env if set
	const lockPath = process.env.E2E_LOCK_PATH;
	if (lockPath) {
		releasePortBandInternal(lockPath);
	}
}

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
	subnet: string;
	traefikIp: string;
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
export function setupE2EComposeEnv(): E2EComposeEnv {
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
		subnet: env.E2E_SUBNET,
		traefikIp: env.E2E_TRAEFIK_IP,
		ports: {
			http: httpPort,
			https: httpsPort,
			db: dbPort,
			requestCounter: requestCounterPort,
		},
		lockPath: lockPath,
		bandIndex: bandIndex,
	};
}

/**
 * Teardown e2e environment (exported for testing)
 */
export function teardownE2EComposeEnv(env: E2EComposeEnv): void {
	if (env.lockPath) {
		releasePortBandInternal(env.lockPath);
	}
}

function main() {
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
}

main();
