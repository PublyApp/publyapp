import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
	ambientCredentialSecrets,
	assertNoPendingMigrations,
	buildApiChildEnv,
	connectionStringSecrets,
	extractConnectionStringPassword,
	extractConnectionStringSecretValues,
	extractEnvValue,
	extractPendingMigrationIds,
	formatMigrationGuardError,
	formatMigrationGuardStatusMessage,
	listMigrationsJson,
	parseArgs,
	parseConnectionStringPairs,
	redactSecrets,
	resolveTrustedProxyCidrs,
	runCommand,
	validateMigrationEntries,
} from './review-api.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');

// parseArgs's own rejection path calls the module-local `err()`, which calls
// process.exit(1) — not throwable/mockable in-process. Spawning the real CLI is the only
// way to observe that rejection without changing production error-handling just for
// testability. parseArgs runs as the very first thing in main(), before any git/gh call, so
// a malformed argument fails fast with no network/worktree dependency.
const runCliArgs = (args) => {
	const result = spawnSync('node', ['scripts/review-api.mjs', ...args], {
		cwd: repoRoot,
		encoding: 'utf8',
		timeout: 10_000,
	});

	return { status: result.status, stderr: String(result.stderr ?? '') };
};

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

// --- parseArgs: malformed input rejection (round-3 review) -----------------------
//
// `Number.parseInt` stops at the first non-digit and silently accepted "5000junk" and
// "5000.5" as port 5000; a leading unrecognized option was accepted as the requested ref;
// a second positional argument was silently dropped. Rejection goes through the
// module-local `err()`, which calls process.exit(1) — not observable in-process, so these
// spawn the real CLI (see runCliArgs above).

test('parseArgs (real CLI): rejects a port value with trailing garbage', () => {
	const { status, stderr } = runCliArgs(['1016', '--port=5000junk']);
	assert.notEqual(status, 0);
	assert.match(stderr, /Invalid --port value: 5000junk/);
});

test('parseArgs (real CLI): rejects a non-integer (decimal) port value', () => {
	const { status, stderr } = runCliArgs(['1016', '--port=5000.5']);
	assert.notEqual(status, 0);
	assert.match(stderr, /Invalid --port value: 5000\.5/);
});

test('parseArgs (real CLI): rejects an unrecognized leading option instead of treating it as the ref', () => {
	const { status, stderr } = runCliArgs(['--bogus', '1016']);
	assert.notEqual(status, 0);
	assert.match(stderr, /Unknown option: --bogus/);
});

test('parseArgs (real CLI): rejects a second positional argument instead of silently dropping it', () => {
	const { status, stderr } = runCliArgs(['1016', '1017']);
	assert.notEqual(status, 0);
	assert.match(stderr, /Unexpected extra argument: 1017/);
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

// --- SSL Password (round-4 review: a second Npgsql credential parameter) ---------------

test('extractConnectionStringSecretValues: collects both Password and the separate SSL Password', () => {
	assert.deepEqual(
		extractConnectionStringSecretValues(
			'Host=x;Password=hunter2;SSL Password=certpass',
		),
		['hunter2', 'certpass'],
	);
});

test('extractConnectionStringSecretValues: is case-insensitive and tolerant of "SSL Password" spacing', () => {
	assert.deepEqual(
		extractConnectionStringSecretValues('Host=x;sslpassword=certpass'),
		['certpass'],
	);
	assert.deepEqual(
		extractConnectionStringSecretValues('Host=x; SSL PASSWORD = certpass '),
		['certpass'],
	);
});

test('connectionStringSecrets: also redacts an isolated SSL Password alongside the full string and Password', () => {
	const connectionString = 'Host=x;Password=hunter2;SSL Password=certpass';
	assert.deepEqual(connectionStringSecrets(connectionString), [
		connectionString,
		'hunter2',
		'certpass',
	]);
});

test('runCommand (real subprocess): redacts an isolated SSL Password that a failing child wrote to stderr on its own', () => {
	const connectionString = 'Host=x;Password=hunter2;SSL Password=certpass';
	const secrets = connectionStringSecrets(connectionString);

	assert.throws(
		() =>
			runCommand(
				'node',
				['-e', "process.stderr.write('certpass'); process.exit(1);"],
				{ secrets },
			),
		(error) => {
			// Full-string redaction alone cannot catch this: the child never echoed the whole
			// connection string, only the isolated SSL Password value.
			assert.doesNotMatch(error.message, /certpass/);
			assert.match(error.message, /\[REDACTED\]/);
			return true;
		},
	);
});

// --- PSW / PWD (round-5 review IMPORTANT: Npgsql's other Password synonyms) -----------
//
// Verified directly against Npgsql 10.0.0's own tagged source
// (https://github.com/npgsql/npgsql/blob/v10.0.0/src/Npgsql/NpgsqlConnectionStringBuilder.cs):
// `[NpgsqlConnectionStringProperty("PSW", "PWD")]` on the `Password` property. These are exactly
// as real a credential-bearing key as `Password` itself — removing either pattern below must
// make its own test (and the real-subprocess proof) fail, the same way removing the SSL Password
// pattern does above.

test('extractConnectionStringSecretValues: recognizes PSW and PWD as Password synonyms', () => {
	assert.deepEqual(extractConnectionStringSecretValues('Host=x;PSW=hunter2'), [
		'hunter2',
	]);
	assert.deepEqual(extractConnectionStringSecretValues('Host=x;PWD=hunter2'), [
		'hunter2',
	]);
});

test('extractConnectionStringSecretValues: PSW/PWD are case-insensitive and tolerate surrounding whitespace', () => {
	assert.deepEqual(
		extractConnectionStringSecretValues('Host=x; psw = hunter2 ;User=y'),
		['hunter2'],
	);
	assert.deepEqual(extractConnectionStringSecretValues('Host=x;pwd=hunter2'), [
		'hunter2',
	]);
});

test('connectionStringSecrets: also redacts an isolated PSW or PWD value alongside the full string', () => {
	assert.deepEqual(connectionStringSecrets('Host=x;PSW=hunter2'), [
		'Host=x;PSW=hunter2',
		'hunter2',
	]);
	assert.deepEqual(connectionStringSecrets('Host=x;PWD=hunter2'), [
		'Host=x;PWD=hunter2',
		'hunter2',
	]);
});

test('runCommand (real subprocess): redacts an isolated PSW value that a failing child wrote to stderr on its own', () => {
	const connectionString = 'Host=x;PSW=hunter2';
	const secrets = connectionStringSecrets(connectionString);

	assert.throws(
		() =>
			runCommand(
				'node',
				['-e', "process.stderr.write('hunter2'); process.exit(1);"],
				{ secrets },
			),
		(error) => {
			assert.doesNotMatch(error.message, /hunter2/);
			assert.match(error.message, /\[REDACTED\]/);
			return true;
		},
	);
});

test('runCommand (real subprocess): redacts an isolated PWD value that a failing child wrote to stderr on its own', () => {
	const connectionString = 'Host=x;PWD=hunter2';
	const secrets = connectionStringSecrets(connectionString);

	assert.throws(
		() =>
			runCommand(
				'node',
				['-e', "process.stderr.write('hunter2'); process.exit(1);"],
				{ secrets },
			),
		(error) => {
			assert.doesNotMatch(error.message, /hunter2/);
			assert.match(error.message, /\[REDACTED\]/);
			return true;
		},
	);
});

// --- PGPASSWORD (round-5 review IMPORTANT: a credential source beyond the connection string) --
//
// Npgsql/libpq also honor the standalone PGPASSWORD environment variable as a password
// (https://www.npgsql.org/doc/connection-string-parameters.html), independent of anything in the
// connection string itself. runCommand inherits the ambient process.env for every subprocess it
// spawns, so this is a real, separate credential source that must be redacted the same way.

test('ambientCredentialSecrets: includes PGPASSWORD when the ambient environment carries it', () => {
	const original = process.env.PGPASSWORD;
	process.env.PGPASSWORD = 'ambient-secret';
	try {
		assert.deepEqual(ambientCredentialSecrets(), ['ambient-secret']);
	} finally {
		if (original === undefined) {
			delete process.env.PGPASSWORD;
		} else {
			process.env.PGPASSWORD = original;
		}
	}
});

test('ambientCredentialSecrets: returns an empty list when PGPASSWORD is not set', () => {
	const original = process.env.PGPASSWORD;
	delete process.env.PGPASSWORD;
	try {
		assert.deepEqual(ambientCredentialSecrets(), []);
	} finally {
		if (original !== undefined) {
			process.env.PGPASSWORD = original;
		}
	}
});

test('runCommand (real subprocess): redacts an ambient PGPASSWORD the child inherited and echoed on its own', () => {
	const original = process.env.PGPASSWORD;
	process.env.PGPASSWORD = 'ambient-secret';
	try {
		const secrets = ambientCredentialSecrets();
		assert.throws(
			() =>
				runCommand(
					'node',
					[
						'-e',
						'process.stderr.write(process.env.PGPASSWORD); process.exit(1);',
					],
					{ secrets },
				),
			(error) => {
				assert.doesNotMatch(error.message, /ambient-secret/);
				assert.match(error.message, /\[REDACTED\]/);
				return true;
			},
		);
	} finally {
		if (original === undefined) {
			delete process.env.PGPASSWORD;
		} else {
			process.env.PGPASSWORD = original;
		}
	}
});

// --- parseConnectionStringPairs / extractConnectionStringPassword: quoting (round-3) ---
//
// Round-3 review: the naive `;`-splitting regex truncated a valid, Npgsql-legal
// double-quoted password containing a literal semicolon at the first `;`, so only a
// fragment was ever redacted. https://www.npgsql.org/doc/connection-string-parameters.html
// documents double/single-quoted values (which may embed `;`) and doubled-quote escaping.

test('parseConnectionStringPairs: an unquoted value stops at the next semicolon', () => {
	assert.deepEqual(parseConnectionStringPairs('Host=localhost;Port=5454'), [
		['Host', 'localhost'],
		['Port', '5454'],
	]);
});

test('extractConnectionStringPassword: a double-quoted password preserves an embedded semicolon and space', () => {
	assert.equal(
		extractConnectionStringPassword(
			'Host=localhost;Database=publyapp;Username=postgres;Password="pa;ss word"',
		),
		'pa;ss word',
	);
});

test('extractConnectionStringPassword: a single-quoted password preserves an embedded semicolon', () => {
	assert.equal(
		extractConnectionStringPassword("Host=localhost;Password='pa;ss word'"),
		'pa;ss word',
	);
});

test('extractConnectionStringPassword: a doubled quote inside a quoted password is an escaped literal quote', () => {
	assert.equal(
		extractConnectionStringPassword(
			'Host=localhost;Password="has ""quotes"" inside"',
		),
		'has "quotes" inside',
	);
});

test('extractConnectionStringPassword: leading/trailing spaces around "=" and the segment are trimmed for unquoted values', () => {
	assert.equal(
		extractConnectionStringPassword(
			'  Host = localhost ; Password = hunter2 ; ',
		),
		'hunter2',
	);
});

test('extractConnectionStringPassword: a quoted value keeps its own internal spacing verbatim', () => {
	assert.equal(
		extractConnectionStringPassword('Host=localhost;Password="  spaced  "'),
		'  spaced  ',
	);
});

test('connectionStringSecrets: a quoted semicolon password is redacted as its own secret alongside the full string', () => {
	const connectionString =
		'Host=localhost;Database=publyapp;Username=postgres;Password="pa;ss word"';
	assert.deepEqual(connectionStringSecrets(connectionString), [
		connectionString,
		'pa;ss word',
	]);
});

test('runCommand (real subprocess): redacts a quoted semicolon password that a failing child wrote to stderr on its own', () => {
	const connectionString = 'Host=x;Password="pa;ss word"';
	const secrets = connectionStringSecrets(connectionString);

	assert.throws(
		() =>
			runCommand(
				'node',
				['-e', "process.stderr.write('pa;ss word'); process.exit(1);"],
				{ secrets },
			),
		(error) => {
			assert.doesNotMatch(error.message, /pa;ss word/);
			assert.match(error.message, /\[REDACTED\]/);
			return true;
		},
	);
});

// --- parseConnectionStringPairs: whitespace before a quoted value (round-6 review) -----
//
// Round-6 review IMPORTANT: the previous whitespace-skip before quote-detection recognized
// only the literal ASCII space (U+0020). Real Npgsql 10.0.0 recognizes the full Unicode
// "White_Space" property there instead — exactly `System.Char.IsWhiteSpace(char)`'s documented
// definition — verified directly against the repository's real Npgsql 10.0.0 assembly with a
// synthetic marker password (never a real credential): SPACE, TAB, LF, CR, CRLF, FF, VT, NBSP
// (U+00A0), NEL (U+0085), OGHAM SPACE MARK (U+1680), EN QUAD (U+2000), HAIR SPACE (U+200A),
// LINE SEPARATOR (U+2028), PARAGRAPH SEPARATOR (U+2029), NARROW NBSP (U+202F), MEDIUM
// MATHEMATICAL SPACE (U+205F), and IDEOGRAPHIC SPACE (U+3000) are all accepted before an
// opening quote; ZERO WIDTH NO-BREAK SPACE / BOM (U+FEFF) is not — Npgsql throws
// FormatException for it, so a connection string carrying it never reaches a live connection.
// `Password=\t"secret"` (a TAB, not a space, before the quote) fell through to the unquoted
// branch and captured the literal text `\t"secret"` (quotes included) as the "value" — which
// never matches what a subprocess actually echoes back, so the real password reached rendered
// output unredacted.
test('parseConnectionStringPairs: a tab before an opening double quote is still recognized as a quoted value', () => {
	assert.deepEqual(
		parseConnectionStringPairs('Host=x;Password=\t"hunter2";User=y'),
		[
			['Host', 'x'],
			['Password', 'hunter2'],
			['User', 'y'],
		],
	);
});

test('parseConnectionStringPairs: a non-breaking space before an opening single quote is still recognized as a quoted value', () => {
	assert.deepEqual(
		parseConnectionStringPairs("Host=x;Password= 'hunter2';User=y"),
		[
			['Host', 'x'],
			['Password', 'hunter2'],
			['User', 'y'],
		],
	);
});

test('parseConnectionStringPairs: a newline before an opening quote is still recognized as a quoted value', () => {
	assert.deepEqual(
		parseConnectionStringPairs('Host=x;Password=\n"hunter2";User=y'),
		[
			['Host', 'x'],
			['Password', 'hunter2'],
			['User', 'y'],
		],
	);
});

test('parseConnectionStringPairs: NEL (U+0085) before an opening quote is recognized — .NET whitespace, not JS \\s', () => {
	// U+0085 is whitespace per System.Char.IsWhiteSpace (confirmed against real Npgsql) but is
	// NOT matched by JavaScript's `\s` regex class — this proves the fix uses the Unicode
	// White_Space property (`\p{White_Space}`), not a `\s`-based shortcut.
	assert.deepEqual(
		parseConnectionStringPairs('Host=x;Password="hunter2";User=y'),
		[
			['Host', 'x'],
			['Password', 'hunter2'],
			['User', 'y'],
		],
	);
});

test('parseConnectionStringPairs: a BOM (U+FEFF) before an opening quote is NOT treated as whitespace', () => {
	// Real Npgsql throws FormatException for this input rather than treating U+FEFF as
	// whitespace, so a connection string carrying it never reaches a live connection. The
	// parser must not over-recognize it either, or "skip" and "trim" would disagree with what
	// Npgsql itself accepts.
	assert.deepEqual(
		parseConnectionStringPairs('Host=x;Password=﻿"hunter2";User=y'),
		[
			['Host', 'x'],
			['Password', '﻿"hunter2"'],
			['User', 'y'],
		],
	);
});

test('extractConnectionStringPassword: a tab-then-double-quote password extracts the raw value, not the literal quotes', () => {
	assert.equal(
		extractConnectionStringPassword('Host=x;Password=\t"hunter2";User=y'),
		'hunter2',
	);
});

test('connectionStringSecrets: a tab-then-quoted password is redacted as its own secret alongside the full string', () => {
	const connectionString = 'Host=x;Password=\t"hunter2"';
	assert.deepEqual(connectionStringSecrets(connectionString), [
		connectionString,
		'hunter2',
	]);
});

test("runCommand (real subprocess): redacts a tab-then-quoted password that a failing child echoed back on its own — the reviewer's reproduction", () => {
	// This is the exact shape of the round-6 finding: Npgsql accepts `Password=\t"secret"` and
	// extracts `secret`; a real failing subprocess that echoes only the isolated password (not
	// the whole connection string) must still have it redacted.
	const connectionString = 'Host=x;Password=\t"hunter2"';
	const secrets = connectionStringSecrets(connectionString);

	assert.throws(
		() =>
			runCommand(
				'node',
				['-e', "process.stderr.write('hunter2'); process.exit(1);"],
				{ secrets },
			),
		(error) => {
			assert.doesNotMatch(error.message, /hunter2/);
			assert.match(error.message, /\[REDACTED\]/);
			return true;
		},
	);
});

test('listMigrationsJson: redacts the isolated password out of an unparseable-JSON indeterminate error', () => {
	const run = (command, args) => {
		if (args.includes('build')) {
			return { stdout: '', stderr: '', status: 0 };
		}

		// Simulate a parser message that quotes an excerpt of the offending input containing
		// the password — modern V8 JSON.parse errors can do exactly this. The password must be
		// at the START of the invalid payload: V8's excerpt is truncated to roughly the first
		// ~12 characters (round-4 review found the previous fixture, 'not json hunter2
		// trailing', never actually placed "hunter2" inside that excerpt — the no-op-redactor
		// mutation this test exists to catch passed unnoticed because of it).
		return { status: 0, stdout: 'hunter2 trailing not json', stderr: '' };
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

// Round-5 review IMPORTANT: listMigrationsJson's own secrets set must also cover the AMBIENT
// PGPASSWORD source, not only the connection string — proving the fix at its actual call site,
// not just the ambientCredentialSecrets primitive in isolation.
//
// The secret must be SHORT ENOUGH to survive inside V8's own JSON.parse error excerpt (round-4
// review: the excerpt truncates to roughly the first ~10-12 characters of the offending input —
// verified directly: `JSON.parse('ambientsecret trailing not json')` throws
// `"...\"ambientsec\"..."`, silently dropping the trailing "ret" and making a fixture built on
// the full 13-character "ambientsecret" pass vacuously regardless of whether redaction works at
// all). "ambpass" (7 chars, the same length class as the Password fixture's "hunter2") fits
// entirely inside that excerpt, confirmed directly:
// `JSON.parse('ambpass trailing not json')` throws `"...\"ambpass tr\"..."`.
test('listMigrationsJson: redacts an ambient PGPASSWORD out of an unparseable-JSON indeterminate error', () => {
	const original = process.env.PGPASSWORD;
	process.env.PGPASSWORD = 'ambpass';
	try {
		const run = (command, args) => {
			if (args.includes('build')) {
				return { stdout: '', stderr: '', status: 0 };
			}

			return { status: 0, stdout: 'ambpass trailing not json', stderr: '' };
		};

		assert.throws(
			() =>
				listMigrationsJson({
					apiDir: '/fake/apps/api',
					connectionString: 'Host=x;Database=publyapp',
					trustedProxyCidrs: 'cidr',
					run,
				}),
			(error) => {
				assert.equal(error.code, 'MIGRATION_GUARD_INDETERMINATE');
				assert.doesNotMatch(error.message, /ambpass/);
				return true;
			},
		);
	} finally {
		if (original === undefined) {
			delete process.env.PGPASSWORD;
		} else {
			process.env.PGPASSWORD = original;
		}
	}
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
