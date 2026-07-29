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

import { assertNoPendingMigrations } from './review-api.mjs';

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
