import assert from 'node:assert/strict';
import test from 'node:test';

import {
	assertNoPendingMigrations,
	buildApiChildEnv,
	connectionStringSecrets,
	extractConnectionStringPassword,
	extractEnvValue,
	extractPendingMigrationIds,
	formatMigrationGuardError,
	formatMigrationGuardStatusMessage,
	listMigrationsJson,
	parseArgs,
	redactSecrets,
	resolveTrustedProxyCidrs,
	runCommand,
	validateMigrationEntries,
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

// --- redactSecrets --------------------------------------------------------------

test('redactSecrets: removes every occurrence of each secret from a string', () => {
	const text =
		'connection failed: Host=x;Password=hunter2 (retry) Password=hunter2 again';
	assert.equal(
		redactSecrets(text, ['hunter2']),
		'connection failed: Host=x;Password=[REDACTED] (retry) Password=[REDACTED] again',
	);
});

test('redactSecrets: ignores empty/nullish secrets without throwing', () => {
	assert.equal(redactSecrets('hello', ['', undefined, null]), 'hello');
});

test('redactSecrets: no-op when nothing matches', () => {
	assert.equal(redactSecrets('hello world', ['nope']), 'hello world');
});

// --- runCommand bounded timeout --------------------------------------------------

test('runCommand: a bounded timeout fails closed instead of hanging forever', () => {
	assert.throws(() =>
		runCommand('node', ['-e', 'setTimeout(() => {}, 5000)'], { timeout: 200 }),
	);
});

// --- validateMigrationEntries (guard-indeterminate) -------------------------------

test('validateMigrationEntries: passes through a well-formed non-empty array unchanged', () => {
	const entries = [
		{ id: 'a', applied: true },
		{ id: 'b', applied: false },
	];
	assert.deepEqual(validateMigrationEntries(entries), entries);
});

test('validateMigrationEntries: throws MIGRATION_GUARD_INDETERMINATE for an empty array', () => {
	assert.throws(
		() => validateMigrationEntries([]),
		(error) => error.code === 'MIGRATION_GUARD_INDETERMINATE',
	);
});

test('validateMigrationEntries: throws MIGRATION_GUARD_INDETERMINATE for a non-array', () => {
	assert.throws(
		() => validateMigrationEntries(null),
		(error) => error.code === 'MIGRATION_GUARD_INDETERMINATE',
	);
	assert.throws(
		() => validateMigrationEntries({ not: 'an array' }),
		(error) => error.code === 'MIGRATION_GUARD_INDETERMINATE',
	);
});

test('validateMigrationEntries: throws MIGRATION_GUARD_INDETERMINATE for applied: null — the exact shape dotnet-ef 10.0.2 emits against an unreachable database', () => {
	const entries = [
		{
			id: '20260511120526_Init',
			name: 'Init',
			safeName: 'Init',
			applied: null,
		},
	];

	assert.throws(
		() => validateMigrationEntries(entries),
		(error) => {
			assert.equal(error.code, 'MIGRATION_GUARD_INDETERMINATE');
			assert.match(error.message, /missing or non-boolean "applied"/);
			// The safe, already-validated id may be named; the untrusted raw entry object
			// (which could carry arbitrary fields) must never be interpolated verbatim.
			assert.match(error.message, /20260511120526_Init/);
			return true;
		},
	);
});

test('validateMigrationEntries: throws MIGRATION_GUARD_INDETERMINATE for a missing or empty id', () => {
	assert.throws(
		() => validateMigrationEntries([{ applied: true }]),
		(error) => error.code === 'MIGRATION_GUARD_INDETERMINATE',
	);
	assert.throws(
		() => validateMigrationEntries([{ id: '', applied: true }]),
		(error) => error.code === 'MIGRATION_GUARD_INDETERMINATE',
	);
});

test('validateMigrationEntries: throws MIGRATION_GUARD_INDETERMINATE for a non-boolean applied', () => {
	assert.throws(
		() => validateMigrationEntries([{ id: 'a', applied: 'true' }]),
		(error) => error.code === 'MIGRATION_GUARD_INDETERMINATE',
	);
	assert.throws(
		() => validateMigrationEntries([{ id: 'a' }]),
		(error) => error.code === 'MIGRATION_GUARD_INDETERMINATE',
	);
});

// --- indeterminate state wired through the real guard, not just the pure validator ---

test('assertNoPendingMigrations: an indeterminate dotnet-ef result blocks instead of resolving to "nothing pending"', () => {
	const run = (command, args) => {
		if (args.includes('build')) {
			return { stdout: '', stderr: '', status: 0 };
		}

		// The exact row shape an independent review probe observed from the pinned
		// dotnet-ef against an unreachable PostgreSQL endpoint: exit 0, applied: null.
		return {
			status: 0,
			stdout: JSON.stringify([
				{
					id: '20260511120526_Init',
					name: 'Init',
					safeName: 'Init',
					applied: null,
				},
			]),
			stderr: '',
		};
	};

	assert.throws(
		() =>
			assertNoPendingMigrations({
				apiDir: '/fake/apps/api',
				connectionString: 'Host=unreachable;Port=1',
				trustedProxyCidrs: '127.0.0.1/32,::1/128',
				allowMigrations: false,
				run,
			}),
		(error) => error.code === 'MIGRATION_GUARD_INDETERMINATE',
	);
});

test('assertNoPendingMigrations: --allow-migrations does NOT bypass an indeterminate result — it is a different failure mode than a known pending migration', () => {
	const run = (command, args) => {
		if (args.includes('build')) {
			return { stdout: '', stderr: '', status: 0 };
		}

		return {
			status: 0,
			stdout: JSON.stringify([{ id: 'a', applied: null }]),
			stderr: '',
		};
	};

	assert.throws(
		() =>
			assertNoPendingMigrations({
				apiDir: '/fake/apps/api',
				connectionString: 'Host=unreachable;Port=1',
				trustedProxyCidrs: '127.0.0.1/32,::1/128',
				allowMigrations: true,
				run,
			}),
		(error) => error.code === 'MIGRATION_GUARD_INDETERMINATE',
	);
});

test('assertNoPendingMigrations: unparseable dotnet-ef output blocks as indeterminate, not as a plain crash', () => {
	const run = (command, args) => {
		if (args.includes('build')) {
			return { stdout: '', stderr: '', status: 0 };
		}

		return { status: 0, stdout: 'not json', stderr: '' };
	};

	assert.throws(
		() =>
			assertNoPendingMigrations({
				apiDir: '/fake/apps/api',
				connectionString: 'Host=unreachable;Port=1',
				trustedProxyCidrs: '127.0.0.1/32,::1/128',
				allowMigrations: false,
				run,
			}),
		(error) => error.code === 'MIGRATION_GUARD_INDETERMINATE',
	);
});

// --- listMigrationsJson: connection string never travels via argv ----------------

test('listMigrationsJson: passes the connection string via env, never argv, and marks it for redaction', () => {
	const calls = [];
	const run = (command, args, options) => {
		calls.push({ command, args, options });
		if (args.includes('build')) {
			return { stdout: '', stderr: '', status: 0 };
		}

		return {
			status: 0,
			stdout: JSON.stringify([{ id: 'a', applied: true }]),
			stderr: '',
		};
	};

	listMigrationsJson({
		apiDir: '/fake/apps/api',
		connectionString: 'Host=x;Password=hunter2',
		trustedProxyCidrs: 'cidr',
		run,
	});

	assert.equal(calls.length, 2);
	for (const call of calls) {
		assert.ok(
			!call.args.includes('--connection'),
			'the connection string must never be passed as a CLI argument',
		);
		assert.ok(
			!call.args.join(' ').includes('hunter2'),
			'the password must never appear in argv',
		);
		assert.equal(
			call.options.env.POSTGRES_CONNECTION_STRING,
			'Host=x;Password=hunter2',
		);
		// Both the full connection string AND the extracted password in isolation must be
		// redacted — round-2 review reproduced a leak where only the password (not the full
		// string) was echoed by a failing child, which full-string-only redaction missed.
		assert.deepEqual(call.options.secrets, [
			'Host=x;Password=hunter2',
			'hunter2',
		]);
	}
});

// --- extractConnectionStringPassword / connectionStringSecrets (redaction gap fix) ---

test('extractConnectionStringPassword: extracts the password component from a connection string', () => {
	assert.equal(
		extractConnectionStringPassword(
			'Host=localhost;Port=5454;Password=hunter2;Username=postgres',
		),
		'hunter2',
	);
});

test('extractConnectionStringPassword: is case-insensitive and tolerates surrounding whitespace', () => {
	assert.equal(
		extractConnectionStringPassword('Host=x; PASSWORD = hunter2 ;User=y'),
		'hunter2',
	);
});

test('extractConnectionStringPassword: returns undefined when there is no password segment', () => {
	assert.equal(
		extractConnectionStringPassword('Host=localhost;Port=5454'),
		undefined,
	);
	assert.equal(extractConnectionStringPassword(undefined), undefined);
	assert.equal(extractConnectionStringPassword(''), undefined);
});

test('connectionStringSecrets: returns both the full string and the isolated password, deduplicated of empties', () => {
	assert.deepEqual(connectionStringSecrets('Host=x;Password=hunter2'), [
		'Host=x;Password=hunter2',
		'hunter2',
	]);
	assert.deepEqual(connectionStringSecrets('Host=x'), ['Host=x']);
});

test('listMigrationsJson: redacts the isolated password out of an unparseable-JSON indeterminate error', () => {
	const run = (command, args) => {
		if (args.includes('build')) {
			return { stdout: '', stderr: '', status: 0 };
		}

		// Simulate a parser message that quotes an excerpt of the offending input containing
		// the password — modern V8 JSON.parse errors can do exactly this.
		return { status: 0, stdout: 'not json hunter2 trailing', stderr: '' };
	};

	assert.throws(
		() =>
			listMigrationsJson({
				apiDir: '/fake/apps/api',
				connectionString: 'Host=x;Password=hunter2',
				trustedProxyCidrs: 'cidr',
				run,
			}),
		(error) => {
			assert.equal(error.code, 'MIGRATION_GUARD_INDETERMINATE');
			assert.doesNotMatch(error.message, /hunter2/);
			return true;
		},
	);
});

// --- validateMigrationEntries: duplicate / whitespace-only ids (round-2 MINOR) ------

test('validateMigrationEntries: throws MIGRATION_GUARD_INDETERMINATE for a whitespace-only id', () => {
	assert.throws(
		() => validateMigrationEntries([{ id: '   ', applied: true }]),
		(error) => error.code === 'MIGRATION_GUARD_INDETERMINATE',
	);
});

test('validateMigrationEntries: throws MIGRATION_GUARD_INDETERMINATE for a duplicate id', () => {
	const entries = [
		{ id: '20260511120526_Init', applied: true },
		{ id: '20260511120526_Init', applied: false },
	];

	assert.throws(
		() => validateMigrationEntries(entries),
		(error) => {
			assert.equal(error.code, 'MIGRATION_GUARD_INDETERMINATE');
			assert.match(error.message, /20260511120526_Init/);
			assert.match(error.message, /more than once/);
			return true;
		},
	);
});

// --- buildApiChildEnv (the escape hatch's actual fix) -----------------------------

test('buildApiChildEnv: forceApiRole pins APP_ROLE=api regardless of the ambient env', () => {
	const previous = process.env.APP_ROLE;
	process.env.APP_ROLE = 'all';
	try {
		const forced = buildApiChildEnv({
			trustedProxyCidrs: 'cidr',
			forceApiRole: true,
		});
		assert.equal(forced.APP_ROLE, 'api');

		const notForced = buildApiChildEnv({
			trustedProxyCidrs: 'cidr',
			forceApiRole: false,
		});
		assert.equal(notForced.APP_ROLE, 'all');
	} finally {
		if (previous === undefined) {
			delete process.env.APP_ROLE;
		} else {
			process.env.APP_ROLE = previous;
		}
	}
});

test('buildApiChildEnv: connectionStringOverride sets POSTGRES_CONNECTION_STRING; omitting it leaves the ambient value alone', () => {
	const overridden = buildApiChildEnv({
		trustedProxyCidrs: 'cidr',
		connectionStringOverride: 'Host=throwaway',
	});
	assert.equal(overridden.POSTGRES_CONNECTION_STRING, 'Host=throwaway');

	const notOverridden = buildApiChildEnv({ trustedProxyCidrs: 'cidr' });
	assert.equal(
		'POSTGRES_CONNECTION_STRING' in notOverridden,
		'POSTGRES_CONNECTION_STRING' in process.env,
	);
});

test('buildApiChildEnv: always carries TRUSTED_PROXY_CIDRS through', () => {
	const env = buildApiChildEnv({ trustedProxyCidrs: '10.0.0.0/8' });
	assert.equal(env.TRUSTED_PROXY_CIDRS, '10.0.0.0/8');
});

// --- formatMigrationGuardStatusMessage (the false-success-message fix) -----------

test('formatMigrationGuardStatusMessage: reports "nothing pending" only when the list is actually empty', () => {
	assert.equal(
		formatMigrationGuardStatusMessage([]),
		'Migration guard: nothing pending.',
	);
});

test('formatMigrationGuardStatusMessage: with a bypassed list, never claims nothing is pending', () => {
	const message = formatMigrationGuardStatusMessage([
		'20260728000000_A',
		'20260728000100_B',
	]);
	assert.doesNotMatch(message, /nothing pending/);
	assert.match(message, /bypassed 2 pending migration/);
	assert.match(message, /20260728000000_A/);
	assert.match(message, /20260728000100_B/);
});
