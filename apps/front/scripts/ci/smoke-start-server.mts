import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import process from 'node:process';

import { sleep } from '@org/shared-ts/utils/any.utils';

// Local mirror of the "Smoke start front server and verify stylesheet tag"
// step in .github/workflows/front-ci.yml.
//
// The workflow does this with inline bash (background job + trap + curl + grep).
// That cannot run from the repo justfile, which uses pwsh on Windows, so the
// same assertions live here in cross-platform Node instead. Keep the two in
// step: packages/scripts-ts/src/check-ci-drift.ts pins the workflow step's
// hash and will fail the gate if the CI side changes without this script being
// re-checked.
//
// What it proves: a production build, served by the real standalone server
// in PRODUCTION runtime mode, returns HTML that links a built CSS asset. That
// catches the class of bug where the build succeeds but the stylesheet never
// reaches the browser, and — like the CI step — exercises validateRuntimeEnv()'s
// production branch: NODE_ENV=production below makes the server require
// PUBLIC_ORIGIN, exactly as the deployed configuration does.
//
// Difference from CI, on purpose: CI hardcodes port 3000 because a fresh runner
// has nothing else on it. A developer machine very often does, and probing a
// busy 3000 would test whatever unrelated app happened to answer — a false
// green. So this picks a free port and tells the server to use it. The port
// also flows into PUBLIC_ORIGIN: production mode refuses to start without it
// (validateRuntimeEnv throws), and the value must be the origin the probe
// actually requests so resolveOrigin sees no mismatch.

const host = '127.0.0.1';
const attempts = 20;
const retryDelayMs = 1000;
const shutdownGraceMs = 5000;

const stylesheetPattern = /rel="stylesheet"[^>]*href="[^"]+\.css"/;

/**
 * Asks the OS for a free port by binding to :0 and releasing it. There is a
 * small window before the server claims it; if something wins that race the
 * server fails to bind and the polling below reports it with the server log.
 */
const getFreePort = async (): Promise<number> => {
	const probe = createServer();

	probe.listen(0, host);
	await once(probe, 'listening');

	const address = probe.address();
	if (address === null || typeof address === 'string') {
		throw new Error('free-port probe did not report an AddressInfo');
	}
	const { port } = address;

	probe.close();
	await once(probe, 'close');

	return port;
};

/**
 * Polls the server until it answers, mirroring the workflow's retry loop.
 * Returns the response body, or null when the server never came up.
 */
const fetchHomeWithRetry = async (origin: string): Promise<string | null> => {
	for (let attempt = 1; attempt <= attempts; attempt += 1) {
		try {
			const response = await fetch(origin, {
				signal: AbortSignal.timeout(5000),
			});

			if (response.ok) {
				return await response.text();
			}
		} catch {
			// Server not listening yet; fall through to the retry delay.
		}

		await sleep(retryDelayMs);
	}

	return null;
};

const port = await getFreePort();
const origin = `http://${host}:${port}/`;
const serverOrigin = `http://${host}:${port}`;
const logs: string[] = [];

const env = {
	...process.env,
	// #1914: production runtime mode is the whole point. The CI smoke step
	// sets NODE_ENV=production in its env: block; the local mirror must do
	// the same or validateRuntimeEnv()'s production branch (and the
	// PUBLIC_ORIGIN requirement) is silently skipped here while the CI
	// step asserts them.
	NODE_ENV: 'production',
	// validateRuntimeEnv throws in production without PUBLIC_ORIGIN.
	// CI hardcodes 127.0.0.1:3000; the mirror binds an ephemeral port, so
	// it must set the origin it actually probes.
	PUBLIC_ORIGIN: serverOrigin,
	PORT: String(port),
	PUBLIC_API_BASE_URL: `http://${host}:5000`,
	SERVER_API_BASE_URL: `http://${host}:5000`,
	TRUSTED_PROXY_CIDRS: '127.0.0.1/32,::1/128',
};
const server = spawn('node', ['server.mjs'], {
	env,
	stdio: ['ignore', 'pipe', 'pipe'],
});

server.stdout.on('data', (chunk) => logs.push(String(chunk)));
server.stderr.on('data', (chunk) => logs.push(String(chunk)));

/**
 * Stops the server and waits for it to actually exit before returning. Killing
 * without awaiting would let this process exit first and orphan the server,
 * leaving the port held for every later run.
 */
const stopServer = async (): Promise<void> => {
	if (server.exitCode !== null || server.signalCode !== null) {
		return;
	}

	server.kill('SIGTERM');

	const exited = await Promise.race([
		once(server, 'exit').then(() => true),
		sleep(shutdownGraceMs).then(() => false),
	]);

	if (!exited) {
		server.kill('SIGKILL');
		await once(server, 'exit');
	}
};

const fail = async (message: string): Promise<never> => {
	await stopServer();

	console.error(message);
	console.error('--- front server output ---');
	console.error(logs.join(''));
	process.exit(1);
};

const html = await fetchHomeWithRetry(origin);

if (html === null) {
	await fail(`front standalone server failed to return HTML from ${origin}`);
}

if (!stylesheetPattern.test(html ?? '')) {
	await fail('front production HTML does not contain a stylesheet link');
}

await stopServer();

console.log('front smoke start: server served HTML linking a CSS asset [OK]');
