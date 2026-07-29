import assert from 'node:assert/strict';
import test from 'node:test';

import {
	assertNoPendingMigrations,
	extractEnvValue,
	extractPendingMigrationIds,
	formatMigrationGuardError,
	parseArgs,
	resolveTrustedProxyCidrs,
} from './review-api.mjs';

test('parseArgs: bare ref, default port, migrations blocked by default', () => {
	assert.deepEqual(parseArgs(['1016']), {
		requestedRef: '1016',
		port: 5000,
		allowMigrations: false,
	});
});

test('parseArgs: --port <n> and --port=<n> both parse', () => {
	assert.deepEqual(parseArgs(['1016', '--port', '5001']), {
		requestedRef: '1016',
		port: 5001,
		allowMigrations: false,
	});
	assert.deepEqual(parseArgs(['1016', '--port=5002']), {
		requestedRef: '1016',
		port: 5002,
		allowMigrations: false,
	});
});

test('parseArgs: --allow-migrations sets the escape hatch regardless of position', () => {
	assert.deepEqual(parseArgs(['--allow-migrations', '1016']), {
		requestedRef: '1016',
		port: 5000,
		allowMigrations: true,
	});
	assert.deepEqual(
		parseArgs(['1016', '--allow-migrations', '--port', '5003']),
		{
			requestedRef: '1016',
			port: 5003,
			allowMigrations: true,
		},
	);
});

test('extractEnvValue: reads a quoted KEY="value" line', () => {
	const content = [
		'# comment',
		'APP_NAME="PublyApp"',
		'POSTGRES_CONNECTION_STRING="Host=localhost;Port=5454;Database=publyapp;Username=postgres;Password=password"',
	].join('\n');

	assert.equal(extractEnvValue(content, 'APP_NAME'), 'PublyApp');
	assert.equal(
		extractEnvValue(content, 'POSTGRES_CONNECTION_STRING'),
		'Host=localhost;Port=5454;Database=publyapp;Username=postgres;Password=password',
	);
});

test('extractEnvValue: returns undefined for an absent key (fresh-worktree case)', () => {
	const content = ['APP_NAME="PublyApp"', 'APP_ROLE="all"'].join('\n');
	assert.equal(extractEnvValue(content, 'TRUSTED_PROXY_CIDRS'), undefined);
});

test('extractEnvValue: does not match a commented-out line', () => {
	const content = '# TRUSTED_PROXY_CIDRS="127.0.0.1/32"';
	assert.equal(extractEnvValue(content, 'TRUSTED_PROXY_CIDRS'), undefined);
});

test('resolveTrustedProxyCidrs: falls back to AppEnvironment.cs default when the worktree file lacks the line', () => {
	const freshWorktreeEnv = ['APP_NAME="PublyApp"', 'APP_ROLE="all"'].join('\n');
	assert.equal(
		resolveTrustedProxyCidrs(freshWorktreeEnv),
		'127.0.0.1/32,::1/128',
	);
});

test('resolveTrustedProxyCidrs: honors an explicit value when present', () => {
	const customized = 'TRUSTED_PROXY_CIDRS="10.0.0.0/8"';
	assert.equal(resolveTrustedProxyCidrs(customized), '10.0.0.0/8');
});

test('extractPendingMigrationIds: keeps only entries dotnet-ef marked unapplied', () => {
	const entries = [
		{ id: '20260511120526_Init', applied: true },
		{
			id: '20260723175718_RepairOrphanedUserAccountProfileLinks',
			applied: true,
		},
		{ id: '20260728000000_SomeNewMigration', applied: false },
	];

	assert.deepEqual(extractPendingMigrationIds(entries), [
		'20260728000000_SomeNewMigration',
	]);
});

test('extractPendingMigrationIds: empty when everything is applied', () => {
	const entries = [
		{ id: '20260511120526_Init', applied: true },
		{ id: '20260712114851_AddTenantOrganizationProfileFields', applied: true },
	];

	assert.deepEqual(extractPendingMigrationIds(entries), []);
});

test('formatMigrationGuardError: names the specific migration(s) and the bypass flag', () => {
	const message = formatMigrationGuardError([
		'20260728000000_SomeNewMigration',
	]);
	assert.match(message, /20260728000000_SomeNewMigration/);
	assert.match(message, /--allow-migrations/);
	assert.match(message, /Refusing to start/);
});

test('formatMigrationGuardError: lists every pending migration, not just the first', () => {
	const message = formatMigrationGuardError([
		'20260728000000_First',
		'20260728000100_Second',
	]);
	assert.match(message, /20260728000000_First/);
	assert.match(message, /20260728000100_Second/);
});

test('assertNoPendingMigrations: throws MIGRATION_GUARD_BLOCKED naming the migration when blocked', () => {
	const calls = [];
	const run = (command, args) => {
		calls.push([command, args]);
		if (args.includes('build')) {
			return { stdout: '', stderr: '', status: 0 };
		}

		return {
			status: 0,
			stdout: JSON.stringify([
				{ id: '20260511120526_Init', applied: true },
				{ id: '20260728000000_Pending', applied: false },
			]),
			stderr: '',
		};
	};

	assert.throws(
		() =>
			assertNoPendingMigrations({
				apiDir: '/fake/apps/api',
				connectionString: 'Host=localhost;Port=5454;Database=publyapp',
				trustedProxyCidrs: '127.0.0.1/32,::1/128',
				allowMigrations: false,
				run,
			}),
		(error) => {
			assert.equal(error.code, 'MIGRATION_GUARD_BLOCKED');
			assert.deepEqual(error.pending, ['20260728000000_Pending']);
			assert.match(error.message, /20260728000000_Pending/);
			return true;
		},
	);

	// Build step must have run before the migrations-list step (doc-gen disabled build first).
	assert.equal(calls[0][0], 'dotnet');
	assert.deepEqual(calls[0][1], [
		'build',
		'-property:OpenApiGenerateDocuments=false',
	]);
	assert.equal(calls[1][1][2], 'dotnet-ef');
});

test('assertNoPendingMigrations: does not throw when nothing is pending', () => {
	const run = (command, args) => {
		if (args.includes('build')) {
			return { stdout: '', stderr: '', status: 0 };
		}

		return {
			status: 0,
			stdout: JSON.stringify([{ id: '20260511120526_Init', applied: true }]),
			stderr: '',
		};
	};

	const result = assertNoPendingMigrations({
		apiDir: '/fake/apps/api',
		connectionString: 'Host=localhost;Port=5454;Database=publyapp',
		trustedProxyCidrs: '127.0.0.1/32,::1/128',
		allowMigrations: false,
		run,
	});

	assert.deepEqual(result.pending, []);
});

test('assertNoPendingMigrations: --allow-migrations proceeds instead of throwing', () => {
	const run = (command, args) => {
		if (args.includes('build')) {
			return { stdout: '', stderr: '', status: 0 };
		}

		return {
			status: 0,
			stdout: JSON.stringify([
				{ id: '20260728000000_Pending', applied: false },
			]),
			stderr: '',
		};
	};

	const result = assertNoPendingMigrations({
		apiDir: '/fake/apps/api',
		connectionString: 'Host=localhost;Port=5454;Database=publyapp',
		trustedProxyCidrs: '127.0.0.1/32,::1/128',
		allowMigrations: true,
		run,
	});

	assert.deepEqual(result.pending, ['20260728000000_Pending']);
});
