#!/usr/bin/env node
/**
 * Build-artifact guard for the front Docker image (#1628, ronde 10).
 *
 * Why this exists: a previous change extracted `resolveTrustProxyFromEnv`
 * into a new top-level `apps/front/trust-proxy.mjs` module and rewired
 * `server.mjs` to `await import('./trust-proxy.mjs')`. Dynamic imports are
 * invisible to static analysis. The Dockerfile only COPYed `server.mjs`
 * and `dist/` from the deploy directory, so the runtime image launched a
 * process that crashed at startup with
 *   Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/app/trust-proxy.mjs'
 * imported from /app/server.mjs
 * Every other e2e test failed at setup with "element(s) not found" because
 * the front never served a single byte. The bug is a model bug — guarding
 * the model (the Dockerfile, the imports list) cannot catch a future
 * similar split; only the running artifact can.
 *
 * What this guard does:
 *  1. Build the front image with the same Dockerfile the e2e stack uses
 *     (or accept a pre-built image via --image <ref>; the e2e workflow
 *     hands one in).
 *  2. Start it as a container with the same env the production / e2e
 *     surface uses, on an ephemeral host port.
 *  3. Wait for an actual HTTP response (HTML or redirect) from the
 *     container — not merely for "the process is running". A container
 *     that has crashed is a process the OS still reports as exited; a
 *     container that is alive but bound to a port and not answering is
 *     the same class of bug the previous nine rounds missed.
 *  4. On failure, dump the container's `docker logs` and read the real
 *     error message back. If the error is a missing module, name the
 *     missing module and the file that imported it in plain words.
 *  5. Always clean up the container (and the throwaway image when we
 *     built it) so the next run on this host starts from a clean slate.
 *
 * It runs as a CLI in the e2e lane: `.github/workflows/front-e2e.yml`'s
 * `build` job invokes it after `docker compose ... build` so the gate
 * catches a missing-file regression before any shard pulls a broken
 * image. It also runs locally on the developer machine via plain
 * `node apps/front/scripts/ci/check-front-runtime-image.mts` (or, once
 * the workflow step is wired, the matching local entry point). Either
 * way, it operates on a real running container — never on the source
 * tree, never on the Dockerfile text, never on a regex over the imports
 * list.
 */
import { spawnSync } from 'node:child_process';
import process from 'node:process';

/**
 * Default image tag used when the script builds the image itself (the
 * developer-machine path). The e2e workflow hands a fully-qualified ref
 * in via --image to match the just-pushed artifact and avoid an extra
 * build.
 */
const DEFAULT_IMAGE_TAG = 'publyapp-front-runtime-guard:local';
const CONTAINER_NAME = 'publyapp-front-runtime-guard';
/** Number of probe attempts; srvx reads the healthcheck and the static
 *  middleware cold-starts in well under 30s on a warm runner. */
const PROBE_ATTEMPTS = 60;
/** Delay between probe attempts. */
const PROBE_DELAY_MS = 1000;
/** Hard cap on the probe loop so a misbehaving container never wedges CI. */
const PROBE_TIMEOUT_MS = 60_000;

/**
 * Front `server.mjs` uses the production-only `validateRuntimeEnv()`
 * gate (#1731 et al.): it refuses to start without `PUBLIC_ORIGIN` and
 * `SERVER_API_BASE_URL`. The runtime image is built with `NODE_ENV=production`
 * baked in, so this guard runs with the same surface. `PUBLIC_API_BASE_URL`
 * is acceptable but optional here; we set all three to known-good values.
 */
const RUN_ENV = {
	NODE_ENV: 'production',
	PORT: '5050',
	PUBLIC_ORIGIN: 'https://front.localhost:5050',
	PUBLIC_API_BASE_URL: 'http://127.0.0.1:5000',
	SERVER_API_BASE_URL: 'http://127.0.0.1:5000',
	TRUSTED_PROXY_CIDRS: '127.0.0.1/32,::1/128',
} as const;

interface DockerResult {
	stdout: string;
	stderr: string;
	status: number;
}

interface NodeCrashExplanation {
	missingModule: string | null;
	importedFrom: string | null;
}

interface FrontRuntimeImageArgs {
	image: string;
}

const log = (message: string): void => {
	console.log(`[front-runtime-image] ${message}`);
};

const fail = async (
	message: string,
	details: ReadonlyArray<string> = [],
): Promise<never> => {
	console.error(`[front-runtime-image] ${message}`);
	for (const line of details) {
		console.error(line);
	}
	process.exit(1);
};

const delay = (ms: number): Promise<void> =>
	new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Runs `docker <args>` and returns `{stdout, stderr, status}`. Throws when
 * the command is missing or otherwise not executable. A non-zero exit
 * is reported via `status` so callers can branch on it without try/catch.
 */
const docker = (
	args: ReadonlyArray<string>,
): DockerResult => {
	const result = spawnSync('docker', [...args], {
		encoding: 'utf8',
		maxBuffer: 50 * 1024 * 1024,
	});

	// `result.error` is undefined when the process ran at all (Node
	// fills it only when the spawn itself failed — e.g. ENOENT on
	// missing binary, or the process was killed by a signal). A
	// non-zero exit is reported through `status`, not `error`, so we
	// deliberately do not throw on it.
	if (result.error !== undefined) {
		throw result.error;
	}

	return {
		stdout: result.stdout ?? '',
		stderr: result.stderr ?? '',
		status: result.status ?? -1,
	};
};

/**
 * Pulls the canonical "module not found" message out of a Node.js crash
 * dump. The format is stable across Node 20+:
 *   Error [ERR_MODULE_NOT_FOUND]: Cannot find module 'X' imported from Y
 *   ... at ... (Y:line:col)
 *   ... at ... (Y:line:col)
 * Anything that does not match falls through to "the container exited
 * unexpectedly" so the cause stays in plain words either way — never a
 * bare exit code, never a stripped status.
 */
export const explainNodeCrash = (
	logs: string,
): NodeCrashExplanation => {
	const missingModuleMatch = logs.match(
		/Error \[ERR_MODULE_NOT_FOUND\]: Cannot find module '([^']+)' imported from ([^\s]+)/,
	);
	if (missingModuleMatch === null) {
		return { missingModule: null, importedFrom: null };
	}
	return {
		missingModule: missingModuleMatch[1] ?? null,
		importedFrom: missingModuleMatch[2] ?? null,
	};
};

export const formatCause = (logs: string): string[] => {
	const { missingModule, importedFrom } = explainNodeCrash(logs);
	if (missingModule !== null && importedFrom !== null) {
		return [
			'Cause: the runtime image is missing a module the server imports at startup.',
			`  Missing module: ${missingModule}`,
			`  Imported from:  ${importedFrom}`,
			'  This is the same shape as the #1628 trust-proxy.mjs regression: a',
			'  top-level .mjs file added next to server.mjs is required at runtime',
			'  but was not COPYed from /workspace/deploy into /app. Add the missing',
			'  COPY to apps/front/Dockerfile and re-run this guard.',
		];
	}
	// Fall through: name the logs so the operator can read them. We never
	// substitute a bare exit code for the actual failure.
	const lines = logs.trimEnd().split('\n');
	const tail = lines.slice(Math.max(0, lines.length - 20)).join('\n');
	return [
		'Cause: the front container exited before answering the probe.',
		'Last log lines (tail):',
		...tail.split('\n').map((line) => `  ${line}`),
	];
};

type ProbeResult =
	| { kind: 'ok'; status: number; body: string }
	| { kind: 'exit'; containerStatus: string; logs: string }
	| { kind: 'timeout' };

/**
 * Polls the container until it serves a real response, or until we know
 * it has crashed, or until the probe budget is exhausted. Returns enough
 * context for the caller to render a human-readable cause on failure.
 *
 * When `port` is null (the container died before Docker published a
 * port mapping), the HTTP probe is skipped entirely and only the
 * container-state checks run — a missing port IS the signal.
 */
const probeUntilAnswering = async (
	port: number | null,
): Promise<ProbeResult> => {
	const origin = port === null ? null : `http://127.0.0.1:${port}/`;
	const deadline = Date.now() + PROBE_TIMEOUT_MS;

	for (let attempt = 1; attempt <= PROBE_ATTEMPTS; attempt += 1) {
		if (Date.now() > deadline) {
			return { kind: 'timeout' };
		}

		// The container may have already exited. Inspect before each probe so
		// we never report "no response" when the real answer is "exited".
		// `--rm` removes the container on exit, so a vanished container is
		// also "exited" — we cannot inspect what is no longer there, so we
		// fall back to a final log read.
		const inspect = docker(['inspect', '--format', '{{.State.Status}}', CONTAINER_NAME]);
		if (inspect.status === 0) {
			const containerStatus = inspect.stdout.trim();
			if (containerStatus === 'exited' || containerStatus === 'dead') {
				// Node.js writes the ERR_MODULE_NOT_FOUND trace to stderr;
				// stdout is typically empty for a crash. Read both so the
				// failure path can render the real cause.
				const logs = readContainerLogs();
				return { kind: 'exit', containerStatus, logs };
			}
		} else if (origin === null) {
			// No port mapping was ever published and the container is
			// already gone — give up probing and let the failure path
			// render the cause from the (empty) log buffer.
			return { kind: 'exit', containerStatus: 'removed', logs: '' };
		}

		if (origin !== null) {
			try {
				const response = await fetch(origin, {
					signal: AbortSignal.timeout(2000),
					redirect: 'manual',
				});

				// Any HTTP status (200, 302, 404 from a missing route) is a real
				// answer: the process is alive, the port is bound, Node answered.
				// The guard's job is "image starts and serves HTTP", not
				// "image serves this specific route", so 302/404 are also passes.
				const body = await response.text();
				return { kind: 'ok', status: response.status, body };
			} catch {
				// Server not yet listening, or the port is still unbound. Fall
				// through to the next attempt.
			}
		}

		await delay(PROBE_DELAY_MS);
	}

	return { kind: 'timeout' };
};

const parseArgs = (argv: ReadonlyArray<string>): FrontRuntimeImageArgs => {
	let image = DEFAULT_IMAGE_TAG;
	for (let i = 0; i < argv.length; i += 1) {
		const arg = argv[i];
		if (arg === '--image' && i + 1 < argv.length) {
			image = argv[i + 1] ?? DEFAULT_IMAGE_TAG;
			i += 1;
		}
	}
	return { image };
};

const main = async (): Promise<void> => {
	const { image } = parseArgs(process.argv.slice(2));

	log(`image: ${image}`);

	// `docker run --rm` would clean up the container on exit, but a
	// crashed container that hits our failure path needs its logs
	// inspected AFTER it stops — and `--rm` removes the container, so
	// the logs go with it. Run WITHOUT `--rm` and always clean up
	// ourselves in the `finally` block below.
	docker(['rm', '-f', CONTAINER_NAME]);

	// Bind to a free port on the host. srvx in the container reads PORT
	// from the environment; we set both to a port we know is free.
	// `--pull never` so a missing local tag fails fast with a clear
	// "image not found locally" message instead of trying to pull from
	// a (possibly unauthenticated) registry.
	const portResult = docker(['run', '-d', '--pull', 'never', '--name', CONTAINER_NAME,
		'-p', '0:5050',
		'-e', `PORT=${RUN_ENV.PORT}`,
		'-e', `NODE_ENV=${RUN_ENV.NODE_ENV}`,
		'-e', `PUBLIC_ORIGIN=${RUN_ENV.PUBLIC_ORIGIN}`,
		'-e', `PUBLIC_API_BASE_URL=${RUN_ENV.PUBLIC_API_BASE_URL}`,
		'-e', `SERVER_API_BASE_URL=${RUN_ENV.SERVER_API_BASE_URL}`,
		'-e', `TRUSTED_PROXY_CIDRS=${RUN_ENV.TRUSTED_PROXY_CIDRS}`,
		image,
	]);

	if (portResult.status !== 0) {
		await fail(
			`docker run failed for image ${image}`,
			[portResult.stderr.trim()],
		);
	}

	// A Node.js crash at startup happens BEFORE Docker publishes the
	// port. The probe loop below already handles "container exited"
	// by reading the logs and naming the cause — so a missing port
	// mapping is itself a signal to skip the HTTP probe and let the
	// loop render the real cause.
	const hostPort = await resolveHostPort(CONTAINER_NAME);
	if (hostPort === null) {
		log('no host port resolved — probing container state directly');
	} else {
		log(`host port: ${hostPort}`);
	}

	let probe: ProbeResult;
	try {
		probe = await probeUntilAnswering(hostPort);
	} finally {
		// Always remove the container so a hard timeout cannot leave a
		// dangling CONTAINER_NAME on the runner.
		docker(['rm', '-f', CONTAINER_NAME]);
	}

	if (probe.kind === 'ok') {
		log(
			`OK: front image served HTTP ${probe.status} from / ` +
				`(body length: ${probe.body.length} bytes)`,
		);
		log('PASS: front runtime image starts and serves HTTP responses.');
		return;
	}

	if (probe.kind === 'exit') {
		await fail(
			`front container exited (status: ${probe.containerStatus}) before answering HTTP`,
			formatCause(probe.logs),
		);
	}

	await fail(
		`front container did not answer HTTP within ` +
			`${Math.round(PROBE_TIMEOUT_MS / 1000)}s`,
		[
			`Probed ${PROBE_ATTEMPTS} times at ${PROBE_DELAY_MS}ms intervals on http://127.0.0.1:${hostPort}/.`,
			`If the container is alive but not answering, inspect it manually:`,
			`  docker run --rm -it ${image} /bin/sh`,
		],
	);
};

/**
 * Resolves the host port that Docker mapped to the container's 5050.
 * `docker port <name> 5050/tcp` prints `0.0.0.0:NNNN`. Returns NNNN, or
 * null on failure.
 */
const resolveHostPort = async (containerName: string): Promise<number | null> => {
	// The container may take a beat to register the port mapping. A short
	// retry avoids racing the publish call on slow CI runners.
	for (let attempt = 1; attempt <= 10; attempt += 1) {
		const result = docker(['port', containerName, '5050/tcp']);
		if (result.status === 0) {
			const match = result.stdout.match(/:(\d+)\s*$/m);
			if (match !== null) {
				const port = Number(match[1]);
				if (Number.isInteger(port) && port > 0) {
					return port;
				}
			}
		}
		await delay(500);
	}
	return null;
};

/**
 * Reads the container's full log stream (stdout + stderr). Node.js
 * crashes dump to stderr, the `front standalone server listening on…`
 * banner goes to stdout; both are part of the cause. Returns an empty
 * string if the container is gone or the read fails for any reason.
 */
const readContainerLogs = (): string => {
	const out = docker(['logs', CONTAINER_NAME]).stdout;
	const err = docker(['logs', CONTAINER_NAME]).stderr;
	// `docker logs` on a missing container writes a short error to
	// stderr. Treat that as "no logs reachable" rather than
	// concatenating daemon noise into the cause.
	if (/No such container/i.test(err)) {
		return out;
	}
	if (err === '') {
		return out;
	}
	if (out === '') {
		return err;
	}
	return `${out}\n${err}`;
};

// Detect whether this file was invoked directly (the CLI) or imported
// (the unit test). `import.meta.url` ends with the file path; when node
// ran the file as the entry point, `process.argv[1]` is the same path.
// The mismatch lets the test file import `formatCause` / `explainNodeCrash`
// without triggering a docker run.
const isMainModule = (): boolean => {
	const entry = process.argv[1];
	if (entry === undefined) {
		return false;
	}
	try {
		return new URL(import.meta.url).pathname === new URL(`file://${entry}`).pathname;
	} catch {
		return false;
	}
};

if (isMainModule()) {
	try {
		await main();
	} catch (error: unknown) {
		// Node 24 swallows top-level await rejections into "undefined" in some
		// host shells; surface them with the real message and stack so the
		// guard never reports "undefined" as its own failure.
		const message = error instanceof Error ? error.message : String(error);
		const stack = error instanceof Error && error.stack !== undefined ? error.stack : '';
		console.error(`[front-runtime-image] uncaught: ${message}`);
		if (stack !== '') {
			console.error(stack);
		}
		process.exit(2);
	}
}
