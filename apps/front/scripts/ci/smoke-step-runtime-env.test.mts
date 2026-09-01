import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { parse } from 'yaml';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FRONT_DIR = path.resolve(__dirname, '..', '..');
const SERVER_ENTRY = path.join(FRONT_DIR, 'server.mjs');
const DIST_SERVER_JS = path.join(FRONT_DIR, 'dist', 'server', 'server.js');
const REPO_ROOT = path.resolve(FRONT_DIR, '..', '..');
const FRONT_CI_PATH = path.join(
	REPO_ROOT,
	'.github',
	'workflows',
	'front-ci.yml',
);

const SMOKE_STEP_NAME = 'Smoke start front server and verify stylesheet tag';

interface YamlStep {
	name?: string;
	env?: Record<string, string> | null;
}

interface YamlWorkflow {
	jobs?: Record<string, { steps?: YamlStep[] }>;
}

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

/**
 * #1914 — pins the runtime contract that the front CI smoke step actually
 * starts a production server, not a dev-mode one. The step in
 * `.github/workflows/front-ci.yml::supply-chain` historically ran the
 * production build without `NODE_ENV: production` and without `PUBLIC_ORIGIN`,
 * so the "smoke start" assertion never exercised the production
 * `validateRuntimeEnv()` guard that ships in `server.mjs` — a false green.
 *
 * This test reads ONE specific step's env block (narrow YAML read, not a
 * generic workflow parser; the same pattern as
 * `apps/front/scripts/ci/vitest-shard-coverage.test.mts`, which extracts
 * one specific matrix field from the same workflow file) and asserts:
 *
 *   1. `NODE_ENV: production` is set.
 *   2. `PUBLIC_ORIGIN` is set and non-empty.
 *   3. The real `server.mjs` started with that exact env block actually
 *      serves HTML at `/` linking a stylesheet — i.e. validateRuntimeEnv()
 *      accepts the configuration the CI step claims to test.
 *
 * The companion negative case (server crashes when PUBLIC_ORIGIN is absent
 * in production) lives in `validate-runtime-env-startup.test.mts`. Together
 * the two tests pin all three required facts:
 *
 *   - Smoke step env must declare `NODE_ENV: production`  → this test's #1
 *   - Smoke step env must declare a valid `PUBLIC_ORIGIN` → this test's #2
 *   - validateRuntimeEnv() must be wired in server.mjs   → existing test
 *
 * A mutation that drops either env key from the step's env block turns
 * this test red for the matching structural or executed cause. A mutation
 * that bypasses `validateRuntimeEnv()` in `server.mjs` turns the existing
 * startup test red (the server no longer crashes, the spawnSync timeout
 * SIGTERMs it, the `result.signal === null` assertion fails).
 */
const readSmokeStepEnv = (): Record<string, string> => {
	const raw = readFileSync(FRONT_CI_PATH, 'utf8');
	const workflow = parse(raw) as YamlWorkflow;
	const supplyChain = workflow.jobs?.['supply-chain'];
	if (supplyChain === undefined) {
		throw new Error(
			`Cannot find the "supply-chain" job in ${FRONT_CI_PATH} (unanalyzable input must fail loud, never pass).`,
		);
	}
	const steps = supplyChain.steps ?? [];
	const smokeStep = steps.find((step) => step.name === SMOKE_STEP_NAME);
	if (smokeStep === undefined) {
		throw new Error(
			`Cannot find step "${SMOKE_STEP_NAME}" in ${FRONT_CI_PATH} job "supply-chain" (unanalyzable input must fail loud, never pass).`,
		);
	}
	const env = smokeStep.env;
	if (env === undefined || env === null || typeof env !== 'object') {
		throw new Error(
			`Step "${SMOKE_STEP_NAME}" in ${FRONT_CI_PATH} does not declare an env block (the production runtime contract requires NODE_ENV=production and a valid PUBLIC_ORIGIN).`,
		);
	}
	return env;
};

void test('smoke step env must set NODE_ENV=production and a valid PUBLIC_ORIGIN', () => {
	const env = readSmokeStepEnv();
	assert.equal(
		env.NODE_ENV,
		'production',
		`Smoke step env must set NODE_ENV=production so the production validateRuntimeEnv() guard runs; got NODE_ENV=${JSON.stringify(env.NODE_ENV ?? null)}`,
	);
	const publicOrigin = env.PUBLIC_ORIGIN;
	assert.ok(
		typeof publicOrigin === 'string' && publicOrigin.trim().length > 0,
		`Smoke step env must set a non-empty PUBLIC_ORIGIN so validateRuntimeEnv() accepts the start; got PUBLIC_ORIGIN=${JSON.stringify(publicOrigin ?? null)}`,
	);
});

void test('smoke step actually starts the production server and serves a stylesheet', async (t) => {
	if (!existsSync(DIST_SERVER_JS)) {
		t.skip(
			'dist/server/server.js not found; run `pnpm --filter front build` first',
		);
		return;
	}
	const env = readSmokeStepEnv();
	assert.equal(
		env.NODE_ENV,
		'production',
		'cannot spawn production server when smoke step env is not NODE_ENV=production',
	);
	const port = await getFreePort();
	const origin = `http://127.0.0.1:${port}/`;
	const childEnv: NodeJS.ProcessEnv = {
		...process.env,
		...env,
		PORT: String(port),
		HOST: '127.0.0.1',
	};
	const server: ChildProcess = spawn(process.execPath, [SERVER_ENTRY], {
		cwd: FRONT_DIR,
		env: childEnv,
		stdio: ['ignore', 'pipe', 'pipe'],
	});
	const logs: string[] = [];
	server.stdout?.on('data', (chunk: Buffer | string) =>
		logs.push(String(chunk)),
	);
	server.stderr?.on('data', (chunk: Buffer | string) =>
		logs.push(String(chunk)),
	);

	const stopServer = async (): Promise<void> => {
		if (server.exitCode !== null || server.signalCode !== null) {
			return;
		}
		server.kill('SIGTERM');
		await new Promise<void>((resolve) => {
			const timer = setTimeout(() => {
				server.kill('SIGKILL');
				resolve();
			}, 2_000);
			server.once('exit', () => {
				clearTimeout(timer);
				resolve();
			});
		});
	};

	const stylesheetPattern = /rel="stylesheet"[^>]*href="[^"]+\.css"/;
	const deadline = Date.now() + 20_000;
	let lastError: unknown = null;
	let html: string | null = null;

	try {
		while (Date.now() < deadline) {
			if (server.exitCode !== null) {
				break;
			}
			try {
				const response = await fetch(origin, {
					signal: AbortSignal.timeout(2_000),
				});
				if (response.ok) {
					html = await response.text();
					break;
				}
			} catch (error) {
				lastError = error;
			}
			await new Promise((resolve) => setTimeout(resolve, 500));
		}
	} finally {
		await stopServer();
	}

	if (html === null) {
		const output = logs.join('');
		assert.fail(
			`front server did not answer HTTP within 20s with the smoke step's env block. ` +
				`Cause: ${server.exitCode !== null ? `server exited with code ${server.exitCode}; ` : 'no HTTP response; '}` +
				`last fetch error: ${lastError instanceof Error ? lastError.message : String(lastError)}; ` +
				`server logs:\n${output}`,
		);
	}
	assert.match(
		html,
		stylesheetPattern,
		'production HTML must link a stylesheet asset (validates that the production server actually served the built bundle)',
	);
});
