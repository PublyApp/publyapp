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
// When validateRuntimeEnv() is wired into server.mjs, the production server
// crashes on its own (exit code 1) when PUBLIC_ORIGIN is missing. If that call
// is ever removed, serve() starts and the process hangs; the test's timeout
// then kills it (signal set, status null), failing loud.
//
// The paired RED/GREEN proof lives in .dump/preuve-r4-demarrage.md.
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
	// serve() runs and hangs — spawnSync's timeout SIGTERMs it, leaving
	// `signal` set and `status` null.
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
