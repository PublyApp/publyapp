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
 * Exclusivity is owned by the OPERATING SYSTEM, not by this program. Band `n`
 * is held by binding a `net.Server` on 127.0.0.1:14000+n with
 * `exclusive: true`. A successful bind IS the reservation; EADDRINUSE means
 * somebody else holds that band, so the scan moves on. Releasing means closing
 * that socket, and a crash releases it just as well — the kernel closes the
 * descriptor. There are therefore no lock files, owner records, PIDs,
 * timestamps, tokens, staleness heuristics or reclamation paths to get wrong:
 * a reservation cannot outlive the process that made it.
 *
 * PORT BANDS:
 * - Each band provides ports for all services: HTTP, HTTPS, DB, Request Counter, Toxiproxy
 * - Bands are allocated sequentially starting from 8080
 * - 500 bands available (8080 to 13070 for the base HTTP port)
 *
 * PROJECT NAME:
 * - Derived from the absolute path of the repository root
 * - NOT from the directory name (which causes collisions)
 * - Normalized to Compose-safe characters (lowercase, digits, dash, underscore)
 */

import { execFileSync } from 'node:child_process';
import { statSync } from 'node:fs';
import { createServer, type Server } from 'node:net';
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

// The lease range: band `n` is leased by binding 127.0.0.1:14000+n.
const LEASE_HOST = '127.0.0.1';
const LEASE_BASE_PORT = 14000;

// The lease range must sit ABOVE every port the stack publishes, or a lease
// would squat a service port of some higher band. This is ordinary module
// arithmetic, checked once at load: the two ranges are both derived from the
// constants right above, and nothing may quietly grow one into the other.
const HIGHEST_PUBLISHED_PORT =
	Math.max(...Object.values(PUBLISHED_BASE_PORTS)) +
	(MAX_BANDS - 1) * PORT_BAND;
if (LEASE_BASE_PORT <= HIGHEST_PUBLISHED_PORT) {
	throw new Error(
		`e2e-compose-env: the lease range ${LEASE_BASE_PORT}-${
			LEASE_BASE_PORT + MAX_BANDS - 1
		} overlaps the published service ports (highest ${HIGHEST_PUBLISHED_PORT}).`,
	);
}

// How long a holder-identification probe (docker ps / ss -tlnp) may take before
// the assignment gives up. Every external command is bounded — none may hang the
// band acquisition forever.
const HOLDER_PROBE_TIMEOUT_MS = 3000;

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
const foreignBandPorts = (
	occupiedPorts: number[],
	projectName: string,
): number[] => {
	const foreignPorts: number[] = [];

	for (const port of occupiedPorts) {
		const holders = describePortHolders(port);
		const allHoldersAreOwnContainers = holders.every((holder) => {
			const match = holder.match(/container `([^`]+)`/);

			return match !== null && match[1].startsWith(`${projectName}-`);
		});

		if (!allHoldersAreOwnContainers) {
			foreignPorts.push(port);
		}
	}

	return foreignPorts;
};

/**
 * The loud, plain-words failure the band assignment throws when a band's ports
 * are occupied by an entity outside this scheme — which port, who holds it,
 * and how to see it yourself (issue #1698). Holding the band's LEASE proves
 * nothing about its service ports: the lease guards band selection, not the
 * published sockets themselves.
 */
export const buildBandConflictMessage = (
	basePort: number,
	occupiedPorts: number[],
): string => {
	const lines: string[] = [
		`Port band ${basePort} is NOT free for this e2e stack: ${occupiedPorts.length} ` +
			'of its ports are already in use by an entity outside this scheme:',
	];

	for (const port of occupiedPorts) {
		for (const holder of describePortHolders(port)) {
			lines.push(`  - port ${port} is taken by ${holder}`);
		}
	}

	lines.push(
		'A leftover or legacy stack (or a stray process) is squatting these ports; the ' +
			'port conflict would otherwise surface only as a silent `docker ' +
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
 * Derives a unique project name from the repository root path
 * (NOT from the worktree name which causes collisions)
 */
export const deriveProjectName = (): string => {
	const repoPath = findRepoRoot();
	const normalized = normalizeComposeName(repoPath);
	return `publyapp-e2e-${normalized}`;
};

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
};

/**
 * A held band: the environment it grants, and the release of the lease socket
 * that holds it. `release` is asynchronous because closing a listening socket
 * is: returning before the close completes would let the next run bind a port
 * this one has not finished unbinding.
 */
export type E2eComposeReservation = {
	env: E2eComposeEnv;
	release: () => Promise<void>;
};

/**
 * The seams a spec replaces. Production passes none of them: the defaults are
 * the real project-name derivation, the real port probe, the real lease range,
 * and stderr.
 */
export type ReservationDependencies = {
	leaseHost?: string;
	leaseBasePort?: number;
	deriveProjectName?: () => string;
	findOccupiedBandPorts?: (basePort: number) => number[];
	closeLeaseServer?: (server: Server) => Promise<void>;
	writeError?: (message: string) => void;
};

/**
 * Binds one lease port, resolving the live server on success and `null` when
 * somebody else already holds it. Any other bind error rejects: an
 * undiagnosed failure must not be mistaken for a busy band and silently
 * repeated 500 times.
 *
 * Settles exactly once — the losing listener is removed, and a server that
 * somehow ends up listening on an error path is closed rather than leaked.
 */
const bindLease = async (host: string, port: number): Promise<Server | null> =>
	await new Promise<Server | null>((resolveBind, rejectBind) => {
		const server = createServer();

		const onError = (error: NodeJS.ErrnoException) => {
			server.removeListener('listening', onListening);
			if (server.listening) {
				server.close();
			}

			if (error.code === 'EADDRINUSE') {
				resolveBind(null);
				return;
			}
			rejectBind(error);
		};

		const onListening = () => {
			server.removeListener('error', onError);
			resolveBind(server);
		};

		server.once('error', onError);
		server.once('listening', onListening);
		server.listen({ host, port, exclusive: true });
	});

/** Closes a lease server, awaiting the close and surfacing its failure. */
const closeLeaseServerDefault = async (server: Server): Promise<void> =>
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
 * An idempotent release: the first call performs the close, and every later
 * call — sequential or concurrent — awaits that same outcome instead of
 * closing an already-closed server (which reports ERR_SERVER_NOT_RUNNING).
 */
const createRelease = (
	server: Server,
	closeServer: (server: Server) => Promise<void>,
): (() => Promise<void>) => {
	let releasePromise: Promise<void> | undefined;

	return () => {
		releasePromise ??= closeServer(server);
		return releasePromise;
	};
};

/**
 * Whether the caller has asked to stop.
 *
 * Read through a call rather than inline: `AbortSignal.aborted` is a readonly
 * boolean, so TypeScript narrows it to `false` for the rest of the scope after
 * the first check and reports every later one as dead code. The value really
 * does change underneath us — rechecking it after each slow step is the whole
 * point — so the check must be opaque to that narrowing.
 */
const isAborted = (abortSignal?: AbortSignal): boolean =>
	abortSignal?.aborted === true;

const abortError = (abortSignal: AbortSignal): Error => {
	const reason: unknown = abortSignal.reason;
	return reason instanceof Error ? reason : new Error(String(reason));
};

/** Builds the closed environment for a band's base port. */
const buildEnv = (basePort: number, projectName: string): E2eComposeEnv => {
	const offset = basePort - BASE_PORTS.traefik_web;
	const httpsPort = BASE_PORTS.traefik_websecure + offset;

	return {
		COMPOSE_PROJECT_NAME: projectName,
		E2E_PORT_TRAEFIK_WEB: String(BASE_PORTS.traefik_web + offset),
		E2E_PORT_TRAEFIK_WEBSECURE: String(httpsPort),
		E2E_PORT_REQUEST_COUNTER: String(BASE_PORTS.request_counter + offset),
		E2E_PORT_TOXIPROXY: String(BASE_PORTS.toxiproxy + offset),
		E2E_PORT_POSTGRES: String(BASE_PORTS.postgres + offset),
		E2E_BASE_URL: `https://${E2E_FRONT_HOST}:${httpsPort}`,
		E2E_API_BASE_URL: `https://${E2E_API_HOST}:${httpsPort}`,
	};
};

/**
 * Reserves a port band for this process and returns its Compose environment
 * plus the release of the lease that holds it.
 *
 * Everything after a successful bind — the abort recheck, the service-port
 * probe, the holder classification, the name derivation, the environment
 * construction — runs under a release that already exists, so no failure path
 * can strand a bound socket. When the cleanup ALSO fails, the original cause
 * still propagates and the cleanup failure is written out rather than lost:
 * a swallowed cleanup failure is how a machine ends up with a band nothing
 * can explain.
 */
export const reserveE2EComposeEnv = async (
	abortSignal?: AbortSignal,
	dependencies: ReservationDependencies = {},
): Promise<E2eComposeReservation> => {
	const leaseHost = dependencies.leaseHost ?? LEASE_HOST;
	const leaseBasePort = dependencies.leaseBasePort ?? LEASE_BASE_PORT;
	const projectNameOf = dependencies.deriveProjectName ?? deriveProjectName;
	const findOccupied =
		dependencies.findOccupiedBandPorts ?? findOccupiedBandPorts;
	const closeServer = dependencies.closeLeaseServer ?? closeLeaseServerDefault;
	const writeError =
		dependencies.writeError ??
		((message: string) => process.stderr.write(message));

	if (abortSignal !== undefined && isAborted(abortSignal)) {
		throw abortError(abortSignal);
	}

	for (let bandIndex = 0; bandIndex < MAX_BANDS; bandIndex++) {
		const server = await bindLease(leaseHost, leaseBasePort + bandIndex);

		// Somebody else holds this band's lease; the next one may be free.
		if (server === null) {
			continue;
		}

		const release = createRelease(server, closeServer);

		try {
			// A signal that arrived while this bind was in flight must not leave
			// the freshly bound lease behind.
			if (abortSignal !== undefined && isAborted(abortSignal)) {
				throw abortError(abortSignal);
			}

			const basePort = BASE_PORTS.traefik_web + bandIndex * PORT_BAND;
			const projectName = projectNameOf();

			// Issue #1698: the lease proves nothing about the SERVICE sockets. A
			// stack that never joined this scheme (a leftover of the legacy
			// hardcoded name, or a stray process) can occupy every port of the
			// band. Detect it BEFORE returning the band, and name it.
			const occupiedPorts = findOccupied(basePort);

			if (occupiedPorts.length > 0) {
				const foreignPorts = foreignBandPorts(occupiedPorts, projectName);

				if (foreignPorts.length > 0) {
					throw new Error(buildBandConflictMessage(basePort, foreignPorts));
				}

				// Every occupant is a leftover of THIS tree's own project: the
				// runner's `down -v` removes our own stack before `up`, so claiming
				// the band is safe. Warn, do not fail — a foreign squatter is the
				// defect, our own interrupted run is not.
				writeError(
					`e2e-compose-env: band ${basePort} is held by THIS tree's own leftover ` +
						'containers; the caller is expected to `docker compose down -v` them ' +
						'before starting the stack.\n',
				);
			}

			// The work above is not instantaneous — the service-port probe is a
			// real out-of-process bind attempt with a multi-second bound — so an
			// interrupt can land anywhere inside it. Handing a live reservation to
			// a caller that is already aborting would have it tear down a stack it
			// never started; the abort is rechecked here so the lease goes back
			// through the catch below instead.
			if (abortSignal !== undefined && isAborted(abortSignal)) {
				throw abortError(abortSignal);
			}

			return { env: buildEnv(basePort, projectName), release };
		} catch (error) {
			try {
				await release();
			} catch (releaseError) {
				// The primary cause is what the operator must act on, but a lease
				// that would not close is a real defect of its own: say so.
				writeError(
					`e2e-compose-env: releasing the lease for band ${String(
						bandIndex,
					)} also failed: ${
						releaseError instanceof Error
							? releaseError.message
							: String(releaseError)
					}\n`,
				);
			}

			throw error;
		}
	}

	throw new Error(
		`Could not acquire port band. All ${MAX_BANDS} bands are in use. ` +
			'Start another instance of the e2e stack? Or wait and retry.',
	);
};
