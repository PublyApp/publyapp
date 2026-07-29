// Integration proof for the migration guard added in #1016.
//
// This is intentionally heavy (spins up a real, disposable Postgres container and runs
// real `dotnet build`/`dotnet-ef` invocations against this worktree's ACTUAL
// apps/api/Migrations) and is therefore NOT wired into the fast `test:review-*` /
// `ci-review-worktree-resolution` gates. Run it directly:
//
//   pnpm test:review-api-migration-guard
//
// Requires Docker and the .NET SDK (both already required by `just test-api`).
//
// Per the review-api.mjs task ("would this test go red if the guard were deleted?"):
// yes — it calls the real, exported `assertNoPendingMigrations` against a database that
// is genuinely missing the branch's real last migration (not a synthetic fixture), and
// asserts on the specific migration id named in the thrown error, not merely that it
// threw.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
	assertNoPendingMigrations,
	spawnApiChild,
	waitForApiReachable,
} from './review-api.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const apiDir = path.join(repoRoot, 'apps', 'api');
const migrationsDir = path.join(apiDir, 'Migrations');

const TEST_CONTAINER = 'publyapp-review-api-guard-test';
const TEST_PORT = 5599;
const TEST_CONNECTION = `Host=localhost;Port=${String(TEST_PORT)};Database=publyapp;Username=postgres;Password=password`;
const TRUSTED_PROXY_CIDRS = '127.0.0.1/32,::1/128';
const BUILD_ENV = { APP_ROLE: 'api', TRUSTED_PROXY_CIDRS };

// The REAL migration ids compiled into this worktree's actual apps/api/Migrations — not
// a synthetic stand-in. Excludes the generated Designer/Snapshot siblings and co-located
// *.Spec.cs test files.
const migrationIds = readdirSync(migrationsDir)
	.filter((name) => /^\d{14}_[A-Za-z0-9]+\.cs$/.test(name))
	.map((name) => name.replace(/\.cs$/, ''))
	.sort();

if (migrationIds.length < 2) {
	throw new Error(
		'Expected at least two real migrations in apps/api/Migrations to run this test.',
	);
}

const lastMigrationId = migrationIds.at(-1);
const secondToLastMigrationId = migrationIds.at(-2);

const dockerIsAvailable = () => {
	try {
		execFileSync('docker', ['info'], { stdio: 'ignore' });
		return true;
	} catch {
		return false;
	}
};

const removeTestContainer = () => {
	try {
		execFileSync('docker', ['rm', '-f', TEST_CONTAINER], { stdio: 'ignore' });
	} catch {
		// No pre-existing container — fine.
	}
};

const waitForPostgresReady = () => {
	for (let attempt = 0; attempt < 30; attempt += 1) {
		try {
			execFileSync(
				'docker',
				['exec', TEST_CONTAINER, 'pg_isready', '-U', 'postgres'],
				{
					stdio: 'ignore',
				},
			);
			return;
		} catch {
			execFileSync('sleep', ['1']);
		}
	}

	throw new Error('Throwaway Postgres container never became ready.');
};

const skip = !dockerIsAvailable();

before(() => {
	if (skip) {
		return;
	}

	removeTestContainer();
	execFileSync('docker', [
		'run',
		'-d',
		'--name',
		TEST_CONTAINER,
		'-e',
		'POSTGRES_PASSWORD=password',
		'-e',
		'POSTGRES_USER=postgres',
		'-e',
		'POSTGRES_DB=publyapp',
		'-p',
		`${String(TEST_PORT)}:5432`,
		'postgres:18-alpine',
	]);
	waitForPostgresReady();

	// Build once (doc-gen disabled — #1006) so the --no-build dotnet-ef calls below work.
	execFileSync(
		'dotnet',
		['build', '-property:OpenApiGenerateDocuments=false'],
		{
			cwd: apiDir,
			env: { ...process.env, ...BUILD_ENV },
			stdio: 'ignore',
		},
	);

	// Apply every migration EXCEPT the real last one, deliberately leaving it unapplied —
	// a genuine "branch carries a migration the database hasn't seen" state, not a fixture.
	execFileSync(
		'dotnet',
		[
			'tool',
			'run',
			'dotnet-ef',
			'database',
			'update',
			secondToLastMigrationId,
			'--no-build',
			'--connection',
			TEST_CONNECTION,
		],
		{ cwd: apiDir, env: { ...process.env, ...BUILD_ENV }, stdio: 'ignore' },
	);
});

after(() => {
	if (skip) {
		return;
	}

	// Backstop in case a launch test's own try/finally never got to run (e.g. the process
	// was killed externally mid-test): sweep both end-to-end ports one more time before
	// tearing down the database they were pointed at.
	for (const port of [CONTROL_PORT, FIX_PORT]) {
		try {
			execFileSync('pkill', ['-9', '-f', `127.0.0.1:${String(port)}`], {
				stdio: 'ignore',
			});
		} catch {
			// Nothing left to kill, or none matched — fine either way.
		}
	}

	removeTestContainer();
});

test(
	'FAILING PROOF: guard refuses to start and names the real unapplied migration',
	{ skip: skip && 'Docker is required for this test' },
	() => {
		assert.throws(
			() =>
				assertNoPendingMigrations({
					apiDir,
					connectionString: TEST_CONNECTION,
					trustedProxyCidrs: TRUSTED_PROXY_CIDRS,
					allowMigrations: false,
				}),
			(error) => {
				assert.equal(error.code, 'MIGRATION_GUARD_BLOCKED');
				assert.deepEqual(error.pending, [lastMigrationId]);
				assert.match(error.message, new RegExp(lastMigrationId));
				assert.match(error.message, /--allow-migrations/);
				return true;
			},
		);
	},
);

// ---------------------------------------------------------------------------
// END-TO-END LAUNCH PROOF (adversarial review, #1016): the JS-boundary guard tests
// above cannot catch a launched API that starts and is then immediately killed by
// apps/api/Infrastructure/Jobs/WorkerMigrationStartupGate — which is exactly what an
// earlier version of this branch shipped: the guard warned and returned, "nothing
// pending" printed, and the real API process crashed on the same migration a moment
// later. These tests call the REAL spawnApiChild the production launcher uses (same
// buildApiChildEnv, same dotnet watch run invocation), against the SAME genuinely
// pending migration left unapplied by `before()`, and observe the actual process.
// ---------------------------------------------------------------------------

const CONTROL_PORT = 5591;
const FIX_PORT = 5592;

// dotnet watch does not exit when the inner app crashes at startup — it logs "Waiting
// for a file to change before restarting" and idles forever (verified by hand). So
// killing `child` alone can leave the actual PublyApp.Api process (a grandchild) and the
// dotnet-watch wrapper running. Belt-and-braces: kill the direct handle, then sweep any
// process still holding this test's unique --urls port.
const killEverythingOnPort = (child, port) => {
	if (!child.killed) {
		child.kill('SIGKILL');
	}

	try {
		// pkill's own option parser chokes on a pattern starting with "--" (it reads
		// "--urls ..." as an unrecognized flag rather than the search pattern) — verified by
		// hand. A pattern that does not start with a dash, like the bare host:port, matches
		// the same processes without tripping that.
		execFileSync('pkill', ['-9', '-f', `127.0.0.1:${String(port)}`], {
			stdio: 'ignore',
		});
	} catch {
		// Nothing left to kill, or none matched — fine either way.
	}
};

test(
	'END-TO-END CONTROL: without forceApiRole, the real launcher process never becomes reachable against a genuinely pending migration (confirms the blocker mechanism)',
	{ skip: skip && 'Docker is required for this test' },
	async () => {
		const { child, publicUrl } = spawnApiChild(repoRoot, CONTROL_PORT, {
			trustedProxyCidrs: TRUSTED_PROXY_CIDRS,
			forceApiRole: false,
			connectionStringOverride: TEST_CONNECTION,
		});

		try {
			// WorkerMigrationStartupGate throws before Kestrel binds, so this should never
			// succeed — a short, bounded poll is enough to prove it, not the full 60x250ms
			// budget the real launcher uses when it expects success.
			const reachable = await waitForApiReachable(`${publicUrl}/health`, {
				attempts: 20,
				intervalMs: 500,
			});

			assert.equal(
				reachable,
				false,
				'the All-role process must NOT become reachable with a pending migration in Development',
			);
		} finally {
			killEverythingOnPort(child, CONTROL_PORT);
		}
	},
);

test(
	'END-TO-END FIX PROOF: with forceApiRole, the real launcher process starts and serves /health despite the same pending migration',
	{ skip: skip && 'Docker is required for this test' },
	async () => {
		const { child, publicUrl } = spawnApiChild(repoRoot, FIX_PORT, {
			trustedProxyCidrs: TRUSTED_PROXY_CIDRS,
			forceApiRole: true,
			connectionStringOverride: TEST_CONNECTION,
		});

		try {
			const reachable = await waitForApiReachable(`${publicUrl}/health`);
			assert.equal(
				reachable,
				true,
				'the Api-role process must become reachable — it never registers WorkerMigrationStartupGate',
			);

			// The process is genuinely up and serving requests despite the pending
			// migration — that is exactly what --allow-migrations buys. It correctly reports
			// 503 Unhealthy (DatabaseMigrationHealthCheck honestly reflects that the
			// migration really is still unapplied); that is truthful reporting, not a crash.
			// The default health check response writer (no custom ResponseWriter is
			// configured — apps/api/Program.cs) only emits the aggregate status word, so
			// assert on that rather than the per-check description text, which never
			// reaches the HTTP body.
			const response = await fetch(`${publicUrl}/health`, {
				signal: AbortSignal.timeout(5000),
			});
			assert.equal(response.status, 503);
			const body = await response.text();
			assert.match(body, /unhealthy/i);

			// Prove it is genuinely staying up (not a fluke single response before crashing)
			// by asking again after a beat.
			await new Promise((resolve) => {
				setTimeout(resolve, 1000);
			});
			const secondResponse = await fetch(`${publicUrl}/health`, {
				signal: AbortSignal.timeout(5000),
			});
			assert.equal(secondResponse.status, 503);

			assert.equal(
				child.exitCode,
				null,
				'the child must still be running, not have exited on its own',
			);
		} finally {
			// dotnet watch's own shutdown-on-SIGTERM timing is unrelated to what this test is
			// proving (that the process starts and serves traffic at all) and was observed to
			// take longer than is worth waiting on here — SIGKILL + the port sweep guarantee
			// cleanup regardless.
			killEverythingOnPort(child, FIX_PORT);
		}
	},
);

test(
	'PASSING PROOF: guard is silent once the real migration is applied',
	{ skip: skip && 'Docker is required for this test' },
	() => {
		execFileSync(
			'dotnet',
			[
				'tool',
				'run',
				'dotnet-ef',
				'database',
				'update',
				'--no-build',
				'--connection',
				TEST_CONNECTION,
			],
			{ cwd: apiDir, env: { ...process.env, ...BUILD_ENV }, stdio: 'ignore' },
		);

		const result = assertNoPendingMigrations({
			apiDir,
			connectionString: TEST_CONNECTION,
			trustedProxyCidrs: TRUSTED_PROXY_CIDRS,
			allowMigrations: false,
		});

		assert.deepEqual(result.pending, []);
	},
);
