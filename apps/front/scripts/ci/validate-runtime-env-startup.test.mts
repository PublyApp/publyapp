import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createServer } from 'node:net';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FRONT_DIR = path.resolve(__dirname, '..', '..');
const SERVER_ENTRY = path.join(FRONT_DIR, 'server.mjs');
const DIST_SERVER_JS = path.join(FRONT_DIR, 'dist', 'server', 'server.js');

const getFreePort = (): Promise<number> => {
	return new Promise((resolve, reject) => {
		const probe = createServer();
		probe.listen(0, '127.0.0.1');
		probe.once('listening', () => {
			const address = probe.address();
			if (address === null || typeof address === 'string') {
				probe.close();
				reject(new Error('free-port probe did not report an AddressInfo'));
				return;
			}
			const { port } = address;
			probe.close();
			probe.once('close', () => resolve(port));
		});
		probe.once('error', reject);
	});
};

// This test exercises the REAL startup path of server.mjs — not a model of it.
// GREEN with validateRuntimeEnv(): the production server exits on its own with
// a non-zero code and names PUBLIC_ORIGIN when the variable is missing. RED if
// that call is removed: serve() starts and hangs; spawnSync's timeout then
// reports ETIMEDOUT, and the output assertion fails because the guard never ran.
// This inline RED/GREEN explanation is the durable non-vacuity record; no local
// trace is required.
void test('startup: NODE_ENV=production without PUBLIC_ORIGIN exits non-zero and names PUBLIC_ORIGIN', async (t) => {
	if (!existsSync(DIST_SERVER_JS)) {
		t.skip(
			'dist/server/server.js not found; run `pnpm --filter front build` first',
		);
		return;
	}

	const port = await getFreePort();
	const result = spawnSync(process.execPath, [SERVER_ENTRY], {
		cwd: FRONT_DIR,
		env: {
			NODE_ENV: 'production',
			PUBLIC_API_BASE_URL: 'http://127.0.0.1:5000',
			SERVER_API_BASE_URL: 'http://127.0.0.1:5000',
			PORT: String(port),
			HOST: '127.0.0.1',
		},
		stdio: ['ignore', 'pipe', 'pipe'],
		timeout: 5_000,
	});

	// When validateRuntimeEnv() is present, the process crashes before opening a
	// socket: `signal` is null, `status` is non-zero. If the call is removed,
	// serve() runs and hangs — spawnSync's timeout then reports
	// `result.error.code === 'ETIMEDOUT'` with `signal` still null and
	// `status` still 1, so the failure surfaces at the output assertion below
	// instead of here.
	assert.equal(
		result.signal,
		null,
		'process must exit on its own, not be killed by the test timeout',
	);
	assert.notEqual(
		result.status,
		0,
		'process must exit with a non-zero code when PUBLIC_ORIGIN is missing in production',
	);

	const output = `${result.stdout.toString()}\n${result.stderr.toString()}`;
	assert.match(
		output,
		/PUBLIC_ORIGIN/,
		'output must name PUBLIC_ORIGIN as the missing variable',
	);
});
