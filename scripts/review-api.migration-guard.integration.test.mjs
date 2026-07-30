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
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import {
	copyFileSync,
	existsSync,
	readFileSync,
	readdirSync,
	unlinkSync,
	writeFileSync,
} from 'node:fs';
import { createConnection } from 'node:net';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
	assertNoPendingMigrations,
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

// Round-2 review found a real readiness race: `pg_isready` run INSIDE the container (the
// prior version of this fixture) can succeed against the official postgres image's
// TEMPORARY, initdb-only server — which the entrypoint documents as unix-socket-only,
// specifically so external TCP callers cannot reach it — before that temporary server is
// torn down and the real, network-facing server takes over the same published port. A raw
// TCP connect from the HOST against the PUBLISHED port cannot reach that temporary server
// at all (it never binds TCP), so it is an accurate "the final server is up" signal,
// verified against the actual failure this reproduced: on a clean branch, the previous
// exec-based probe let EF proceed early and it hit "Connection reset by peer" applying the
// penultimate migration.
const isTcpPortReachable = (port, host = '127.0.0.1') =>
	new Promise((resolve) => {
		const socket = createConnection({ port, host });
		const finish = (result) => {
			socket.removeAllListeners();
			socket.destroy();
			resolve(result);
		};
		socket.once('connect', () => finish(true));
		socket.once('error', () => finish(false));
		socket.setTimeout(1000, () => finish(false));
	});

// Round-4 review IMPORTANT: a raw TCP connect (above) proves only that SOME server accepted
// the connection — under host load, `docker run`'s published port can be TCP-reachable while
// the real postgres process inside is still refusing authenticated sessions with
// `57P03: the database system is starting up` (a different startup phase than the round-2
// temporary-server race the TCP check above was built to catch: this is the REAL server,
// listening, but not yet accepting logins). Reproduced on the untouched clean branch: every
// one of the five cases in the shared `before` hook failed with exactly that error, exhausting
// the five EF retries in runDotnetWithDiagnostics. Gate on an authenticated query actually
// succeeding — via `docker exec` + psql running INSIDE the container (avoids depending on a
// host-installed psql client) — not on socket acceptance.
const isPostgresAcceptingAuthenticatedSessions = () => {
	const result = spawnSync(
		'docker',
		[
			'exec',
			'-e',
			'PGPASSWORD=password',
			TEST_CONTAINER,
			'psql',
			'-U',
			'postgres',
			'-d',
			'publyapp',
			'-c',
			'SELECT 1',
		],
		{ stdio: 'ignore' },
	);

	return result.status === 0;
};

const waitForPostgresReady = async () => {
	for (let attempt = 0; attempt < 60; attempt += 1) {
		if (isPostgresAcceptingAuthenticatedSessions()) {
			return;
		}

		await new Promise((resolve) => {
			setTimeout(resolve, 500);
		});
	}

	throw new Error(
		`Throwaway Postgres container never accepted an authenticated session within the ` +
			`timeout (published host port ${String(TEST_PORT)}).`,
	);
};

// Round-2 review also found that `stdio: 'ignore'` on the fixture's EF commands turned a
// real, diagnosable failure (the readiness race above) into four identical opaque setup
// failures with no way to tell what actually went wrong. Captures output, retries a few
// times (the readiness race can still bite in the first second after the TCP port opens,
// since Postgres can accept connections fractionally before it will accept a real
// authenticated session), and throws with the real stdout/stderr attached on final failure.
const runDotnetWithDiagnostics = (
	args,
	{ attempts = 5, retryDelayMs = 2000 } = {},
) => {
	let lastResult;
	for (let attempt = 1; attempt <= attempts; attempt += 1) {
		lastResult = spawnSyncCapture('dotnet', args);
		if (lastResult.status === 0) {
			return lastResult;
		}

		if (attempt < attempts) {
			execFileSync('sleep', [String(retryDelayMs / 1000)]);
		}
	}

	throw new Error(
		`dotnet ${args.join(' ')} failed after ${String(attempts)} attempt(s).\n` +
			`stdout:\n${lastResult.stdout}\nstderr:\n${lastResult.stderr}`,
	);
};

const spawnSyncCapture = (command, args) => {
	const result = spawnSync(command, args, {
		cwd: apiDir,
		env: { ...process.env, ...BUILD_ENV },
		encoding: 'utf8',
	});

	return {
		status: result.status ?? -1,
		stdout: String(result.stdout ?? ''),
		stderr: String(result.stderr ?? ''),
	};
};

const skip = !dockerIsAvailable();

before(async () => {
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
	await waitForPostgresReady();

	// Build once (doc-gen disabled — #1006) so the --no-build dotnet-ef calls below work.
	runDotnetWithDiagnostics([
		'build',
		'-property:OpenApiGenerateDocuments=false',
	]);

	// Apply every migration EXCEPT the real last one, deliberately leaving it unapplied —
	// a genuine "branch carries a migration the database hasn't seen" state, not a fixture.
	runDotnetWithDiagnostics([
		'tool',
		'run',
		'dotnet-ef',
		'database',
		'update',
		secondToLastMigrationId,
		'--no-build',
		'--connection',
		TEST_CONNECTION,
	]);
});

after(() => {
	if (skip) {
		return;
	}

	// Backstop in case a launch test's own try/finally never got to run (e.g. the process
	// was killed externally mid-test): sweep both end-to-end ports one more time before
	// tearing down the database they were pointed at.
	for (const port of [CLI_PORT, NORMAL_LAUNCH_PORT, MISSING_VALUE_PORT]) {
		try {
			execFileSync('pkill', ['-9', '-f', `127.0.0.1:${String(port)}`], {
				stdio: 'ignore',
			});
		} catch {
			// Nothing left to kill, or none matched — fine either way.
		}
	}

	restoreEnvFileIfBackedUp();
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
// END-TO-END LAUNCH PROOF (adversarial review round 2): the round-1 version of this test
// called spawnApiChild directly with an explicit connectionStringOverride — a path
// `main()` itself did not take, so it could not catch (and did not catch) the BLOCKER
// round 2 found: buildApiChildEnv started from the launcher's ambient process.env and only
// pinned the connection string when told to, which `main()` did not do. This version
// drives the REAL CLI entrypoint (`node scripts/review-api.mjs`) exactly as a reviewer
// would run it, against the SAME genuinely pending migration left unapplied by `before()`.
// ---------------------------------------------------------------------------

const CLI_PORT = 5590;
const LIVENESS_PATH = '/health/live';
const READINESS_PATH = '/health';
const envFilePath = path.join(repoRoot, '.env.development');
const envFileBackupPath = `${envFilePath}.review-api-test-backup`;

// A DIFFERENT, fully-migrated database — the shared dev database this worktree's
// .env.development normally points at — standing in for "the reviewer's own shell happens
// to export POSTGRES_CONNECTION_STRING", exactly the scenario round-2 review's synthetic
// probe reproduced (`guard=guard-db child=ambient-db`). It is deliberately NOT the
// throwaway TEST_CONNECTION above. If the launched API used this instead of the worktree
// file's throwaway connection, /health would report 200 Healthy (this database has every
// migration applied) instead of 503 Unhealthy — a sharp, unambiguous tell that does not
// depend on the process merely staying alive.
const AMBIENT_DECOY_CONNECTION =
	'Host=localhost;Port=5454;Database=publyapp;Username=postgres;Password=password';

const isPortFree = async (port) => !(await isTcpPortReachable(port));

const backUpEnvFile = () => {
	copyFileSync(envFilePath, envFileBackupPath);
};

const restoreEnvFileIfBackedUp = () => {
	if (existsSync(envFileBackupPath)) {
		copyFileSync(envFileBackupPath, envFilePath);
		unlinkSync(envFileBackupPath);
	}
};

const withWorktreeConnectionString = async (temporaryConnectionString, run) => {
	backUpEnvFile();
	const original = readFileSync(envFilePath, 'utf8');
	const rewritten = original.replace(
		/^POSTGRES_CONNECTION_STRING=.*$/m,
		`POSTGRES_CONNECTION_STRING="${temporaryConnectionString}"`,
	);
	assert.notEqual(
		rewritten,
		original,
		'the POSTGRES_CONNECTION_STRING line must actually be found and replaced',
	);
	writeFileSync(envFilePath, rewritten);

	try {
		return await run();
	} finally {
		writeFileSync(envFilePath, original);
		if (existsSync(envFileBackupPath)) {
			unlinkSync(envFileBackupPath);
		}
	}
};

// Round-3 review: no test owned the case where the worktree file has NO
// POSTGRES_CONNECTION_STRING line at all — only the pure parser's absent-key return was
// covered. Removes the line entirely (not merely blanking its value) rather than the
// substitution above.
const withWorktreeConnectionStringRemoved = async (run) => {
	backUpEnvFile();
	const original = readFileSync(envFilePath, 'utf8');
	const rewritten = original
		.split('\n')
		.filter((line) => !line.startsWith('POSTGRES_CONNECTION_STRING='))
		.join('\n');
	assert.notEqual(
		rewritten,
		original,
		'the POSTGRES_CONNECTION_STRING line must actually be found and removed',
	);
	writeFileSync(envFilePath, rewritten);

	try {
		return await run();
	} finally {
		writeFileSync(envFilePath, original);
		if (existsSync(envFileBackupPath)) {
			unlinkSync(envFileBackupPath);
		}
	}
};

const killProcessGroup = (child, port) => {
	if (child.exitCode === null && !child.killed) {
		try {
			process.kill(-child.pid, 'SIGKILL');
		} catch {
			// Already gone.
		}
	}

	try {
		// pkill's own option parser chokes on a pattern starting with "--" (verified by hand:
		// it reads "--urls ..." as an unrecognized flag rather than the search pattern). The
		// bare host:port does not start with a dash and matches the same processes.
		execFileSync('pkill', ['-9', '-f', `127.0.0.1:${String(port)}`], {
			stdio: 'ignore',
		});
	} catch {
		// Nothing left to kill, or none matched — fine either way.
	}
};

// Bounded, guaranteed cleanup for a detached child tree, for use from a `finally`.
//
// Round-4 review BLOCKER: a prior version of the missing-value test used SYNCHRONOUS
// `spawnSync(..., { timeout })`. That is only safe while the CLI exits before ever launching
// anything. When the regression this test exists to catch was restored (fall back to an
// ambient connection string instead of failing closed), the real CLI launched `dotnet watch`
// and installed its own SIGTERM handler — spawnSync's internal timeout could send one signal
// to the direct child, but review-api.mjs's handler only forwards that signal once (no
// escalation, no self-exit), so a slow/ignoring descendant left the whole tree, and the
// blocked event loop, alive well past the "30-second" bound; the test's own `after` cleanup
// could not run at all while spawnSync blocked it. This performs an escalating, bounded
// SIGTERM → SIGKILL reap against the process GROUP (never throws — it runs in a `finally` and
// must not mask a real assertion failure), then sweeps by the port pattern as a backstop for
// any descendant that re-parented outside the group.
const killAndReapProcessGroup = async (
	child,
	port,
	{ graceMs = 5000 } = {},
) => {
	const stillRunning = () =>
		child.exitCode === null && child.signalCode === null && !child.killed;

	const waitForExit = (timeoutMs) =>
		Promise.race([
			once(child, 'exit').then(() => true),
			new Promise((resolve) => {
				setTimeout(() => resolve(false), timeoutMs);
			}),
		]);

	if (stillRunning()) {
		try {
			process.kill(-child.pid, 'SIGTERM');
		} catch {
			// Already gone, or never got its own group.
		}

		const exitedGracefully = await waitForExit(graceMs);
		if (!exitedGracefully && stillRunning()) {
			try {
				process.kill(-child.pid, 'SIGKILL');
			} catch {
				// Already gone.
			}

			await waitForExit(graceMs);
		}
	}

	// Backstop: sweep anything still bound to the test port by command-line pattern, in case a
	// descendant re-parented outside this process group (e.g. under a re-forking watcher).
	try {
		execFileSync('pkill', ['-9', '-f', `127.0.0.1:${String(port)}`], {
			stdio: 'ignore',
		});
	} catch {
		// Nothing left to kill, or none matched — fine either way.
	}
};

// ---------------------------------------------------------------------------
// Hosted-service manifest probe (round-3 review MINOR): the ordinary-launch test's only
// negative assertion used to be "the Quartz scheduler log line is absent" — registering
// WorkerHeartbeatService in the Api role without Quartz still passed. Reusing the shipped
// --print-hosted-services probe (Lib/Diagnostics/HostedServiceManifestCli.cs, the same
// mechanism apps/api/Lib/Architecture/AppRoleComposition.Spec.cs and
// AppEnvironmentDotEnvPrecedence.Spec.cs assert against) checks the COMPLETE resolved
// hosted-service set, not one log line, so any unexpected service — named or not — fails it.
//
// Round-4 review BLOCKER: the previous version of this probe hard-coded APP_ROLE: 'api' into
// this SEPARATE diagnostic process, so it only ever proved that an explicitly Api-pinned
// process has the Api allowlist — nothing about the API the real CLI actually launched. When
// the reviewer restored the unsafe round-2 behavior (`forceApiRole: guardResult.pending.length
// > 0`), the ordinary launch visibly started the worker engine (Quartz scheduler created,
// leadership acquired) while this probe — and the "no job engine starts" test built on it —
// still passed, because both hard-coded the very value under test. Fixed by reading the REAL
// launched process's ACTUAL resolved environment (via /proc/<pid>/environ — Linux-only,
// consistent with the rest of this file's POSIX-only process-tree handling) and driving both
// a direct assertion AND this probe from that observed truth, never from an assumption.
// ---------------------------------------------------------------------------

const HOSTED_SERVICE_LINE_PREFIX = 'HOSTED_SERVICE:';
const HOSTED_SERVICES_END_MARKER = 'HOSTED_SERVICES_END';

// Mirrors AppRoleCompositionSpec's ApiRoleAllowedHostedServices — the only hosted services
// permitted in the Api-role graph (design §3.2, D1). Kept independent (not imported; there is
// no cross-language import) so a change to one allowlist without the other is visible as a
// test diff, not a silent divergence.
const ALLOWED_API_ROLE_HOSTED_SERVICES = [
	'Microsoft.Extensions.Diagnostics.HealthChecks.HealthCheckPublisherHostedService',
	'Microsoft.AspNetCore.Hosting.GenericWebHostService',
].sort();

const findApiAssemblyPath = () => {
	const binRoot = path.join(apiDir, '.artifacts', 'bin', 'PublyApp.Api');
	for (const configuration of readdirSync(binRoot)) {
		const configurationDir = path.join(binRoot, configuration);
		for (const framework of readdirSync(configurationDir)) {
			const candidate = path.join(
				configurationDir,
				framework,
				'PublyApp.Api.dll',
			);
			if (existsSync(candidate)) {
				return candidate;
			}
		}
	}

	throw new Error(`Could not find a built PublyApp.Api.dll under ${binRoot}.`);
};

// Finds the PID of a currently-running process bound to this exact host:port — matches on
// the literal `--urls http://127.0.0.1:<port>` argument review-api.mjs's spawnApiChild passes,
// which every process in the dotnet-watch chain carries in its own argv (verified by hand:
// round-4 review's hung-process capture showed both "dotnet watch run ... --urls ..." and
// ".../dotnet-watch.dll run ... --urls ..." carrying it). Prefers the innermost
// dotnet-watch.dll process — .NET's hot-reload host actually composes and runs the app's DI
// container IN that process, not a further child — but any matching PID's environment is
// equally representative, since env vars are inherited unmodified down the whole spawn chain;
// this preference only picks the process most directly responsible for the resolved graph.
const findRealApiHostPid = (port) => {
	const urlPattern = `--urls http://127\\.0\\.0\\.1:${String(port)}`;

	const preferred = spawnSync(
		'pgrep',
		['-f', `dotnet-watch\\.dll.*${urlPattern}`],
		{ encoding: 'utf8' },
	);
	const preferredPids = preferred.stdout
		.split('\n')
		.map((line) => line.trim())
		.filter(Boolean);
	if (preferredPids.length > 0) {
		return Number.parseInt(preferredPids[0], 10);
	}

	const fallback = spawnSync('pgrep', ['-f', urlPattern], { encoding: 'utf8' });
	const fallbackPids = fallback.stdout
		.split('\n')
		.map((line) => line.trim())
		.filter(Boolean);
	if (fallbackPids.length === 0) {
		throw new Error(
			`No running dotnet process matched "${urlPattern}" — the real CLI does not ` +
				'appear to have launched anything on this port.',
		);
	}

	return Number.parseInt(fallbackPids[0], 10);
};

// Reads the REAL, resolved OS-level environment of an already-running process by PID — the
// exact env block Node's spawn() set at exec time, not a value this test merely assumes was
// used. Linux-only (/proc), consistent with the rest of this file's POSIX-only process-tree
// handling (Docker-gated anyway).
const readRealProcessEnv = (pid) => {
	const raw = readFileSync(`/proc/${String(pid)}/environ`, 'latin1');
	const env = {};
	for (const entry of raw.split('\0')) {
		if (entry.length === 0) {
			continue;
		}

		const separatorIndex = entry.indexOf('=');
		if (separatorIndex === -1) {
			continue;
		}

		env[entry.slice(0, separatorIndex)] = entry.slice(separatorIndex + 1);
	}

	return env;
};

// Runs the shipped --print-hosted-services probe using the EXACT env values (APP_ROLE,
// TRUSTED_PROXY_CIDRS, POSTGRES_CONNECTION_STRING) observed on the real launched process —
// never a hard-coded assumption of what the launcher should have passed. Returns the
// resolved hosted-service type names.
const runHostedServiceManifestProbe = ({
	appRole,
	trustedProxyCidrs,
	connectionString,
}) => {
	const assemblyPath = findApiAssemblyPath();
	const result = spawnSync(
		'dotnet',
		['exec', assemblyPath, '--print-hosted-services'],
		{
			cwd: apiDir,
			encoding: 'utf8',
			env: {
				...process.env,
				ASPNETCORE_ENVIRONMENT: 'Development',
				APP_ROLE: appRole,
				TRUSTED_PROXY_CIDRS: trustedProxyCidrs,
				POSTGRES_CONNECTION_STRING: connectionString,
			},
			timeout: 30_000,
		},
	);

	assert.equal(
		result.status,
		0,
		`hosted-service manifest probe failed: ${result.stdout} ${result.stderr}`,
	);
	assert.match(result.stdout, new RegExp(HOSTED_SERVICES_END_MARKER));

	return result.stdout
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => line.startsWith(HOSTED_SERVICE_LINE_PREFIX))
		.map((line) => line.slice(HOSTED_SERVICE_LINE_PREFIX.length));
};

test(
	'END-TO-END: the real CLI pins the guard and the launched API to the SAME (worktree file) connection string, not an ambient one',
	{ skip: skip && 'Docker is required for this test' },
	async () => {
		await withWorktreeConnectionString(TEST_CONNECTION, async () => {
			const free = await isPortFree(CLI_PORT);
			assert.equal(
				free,
				true,
				'the test port must be free before spawning the real CLI',
			);

			const child = spawn(
				'node',
				[
					'scripts/review-api.mjs',
					'1016',
					'--allow-migrations',
					'--port',
					String(CLI_PORT),
				],
				{
					cwd: repoRoot,
					stdio: 'inherit',
					detached: true,
					env: {
						...process.env,
						// The exact scenario round-2 review reproduced: an ambient connection
						// string in the operator's own shell, different from the worktree file
						// and (unlike it) fully migrated.
						POSTGRES_CONNECTION_STRING: AMBIENT_DECOY_CONNECTION,
					},
				},
			);

			try {
				const liveUrl = `http://127.0.0.1:${String(CLI_PORT)}${LIVENESS_PATH}`;
				const readyUrl = `http://127.0.0.1:${String(CLI_PORT)}${READINESS_PATH}`;

				// /health/live never runs any registered health check (Predicate: _ => false —
				// apps/api/Program.cs), so it is a signal that OUR spawned process specifically
				// bound this now-verified-free port, independent of migration/database state —
				// unlike /health, which a stale unrelated process could also happen to answer.
				// Generous budget: the CLI runs its own guard build + dotnet-ef check, THEN its
				// own `dotnet watch run` build, before the app even starts listening — all
				// before this outer poll sees anything.
				const live = await waitForApiReachable(liveUrl, {
					attempts: 180,
					intervalMs: 500,
				});
				assert.equal(
					live,
					true,
					'the real CLI must actually launch and bind the port',
				);

				// waitForApiReachable is intentionally status-agnostic (any HTTP response counts
				// as "reachable" — appropriate for /health above, whose 503 is deliberate under
				// --allow-migrations). Round-3 review found that made this assertion pass even
				// against a 404 for an unmapped /health/live route: renaming the real route to
				// /health/live-broken still passed. Fetch it directly here and require the actual
				// expected 200, not merely "something answered".
				const liveResponse = await fetch(liveUrl, {
					signal: AbortSignal.timeout(5000),
				});
				assert.equal(
					liveResponse.status,
					200,
					'/health/live must actually be mapped and healthy, not merely reachable ' +
						'(a 404 for an unmapped route would also satisfy status-agnostic reachability)',
				);

				const readinessResponse = await fetch(readyUrl, {
					signal: AbortSignal.timeout(5000),
				});
				assert.equal(
					readinessResponse.status,
					503,
					"the launched API must be checking the worktree file's database (pending " +
						'migration → 503) — 200 would mean it used the ambient decoy instead',
				);
				const body = await readinessResponse.text();
				assert.match(body, /unhealthy/i);
			} finally {
				killProcessGroup(child, CLI_PORT);
			}
		});
	},
);

test(
	'PASSING PROOF: guard is silent once the real migration is applied',
	{ skip: skip && 'Docker is required for this test' },
	() => {
		runDotnetWithDiagnostics([
			'tool',
			'run',
			'dotnet-ef',
			'database',
			'update',
			'--no-build',
			'--connection',
			TEST_CONNECTION,
		]);

		const result = assertNoPendingMigrations({
			apiDir,
			connectionString: TEST_CONNECTION,
			trustedProxyCidrs: TRUSTED_PROXY_CIDRS,
			allowMigrations: false,
		});

		assert.deepEqual(result.pending, []);
	},
);

// ---------------------------------------------------------------------------
// BLOCKER (round-2 review): "ordinary review sessions run the worker/job engine on the
// shared database". main() used to pin forceApiRole only when the guard returned a
// non-empty pending list — the overwhelmingly common path (no pending migration, no
// --allow-migrations) kept .env.development's APP_ROLE="all", starting JobQueueProcessor,
// JobQueueListener, SchedulerLeaderService, JobQueueMonitorService, WorkerHeartbeatService,
// and InvitationEmailOutboxDispatcher against the shared database on every ordinary launch.
// Runs AFTER "PASSING PROOF" above, which already fully migrated the throwaway database, so
// this is a genuine "nothing pending, no bypass flag" launch — the common case, not the
// escape hatch.
// ---------------------------------------------------------------------------

const NORMAL_LAUNCH_PORT = 5593;

test(
	'END-TO-END: an ordinary launch (fully migrated, no --allow-migrations) still pins the Api role — no job engine starts against the shared database',
	{ skip: skip && 'Docker is required for this test' },
	async () => {
		await withWorktreeConnectionString(TEST_CONNECTION, async () => {
			const free = await isPortFree(NORMAL_LAUNCH_PORT);
			assert.equal(
				free,
				true,
				'the test port must be free before spawning the real CLI',
			);

			const child = spawn(
				'node',
				[
					'scripts/review-api.mjs',
					'1016',
					'--port',
					String(NORMAL_LAUNCH_PORT),
				],
				{
					cwd: repoRoot,
					stdio: 'inherit',
					detached: true,
					env: { ...process.env },
				},
			);

			try {
				const liveUrl = `http://127.0.0.1:${String(NORMAL_LAUNCH_PORT)}${LIVENESS_PATH}`;
				const live = await waitForApiReachable(liveUrl, {
					attempts: 180,
					intervalMs: 500,
				});
				assert.equal(
					live,
					true,
					'the real CLI must actually launch and bind the port',
				);

				// waitForApiReachable is status-agnostic; require the actual expected 200
				// directly, not merely "something answered" (round-3 review: a 404 for an
				// unmapped route would also satisfy plain reachability).
				const liveResponse = await fetch(liveUrl, {
					signal: AbortSignal.timeout(5000),
				});
				assert.equal(liveResponse.status, 200);

				// Round-4 review BLOCKER: the prior version of this test derived its expected
				// env from what main() is SUPPOSED to do, then ran a separately spawned,
				// hard-coded-APP_ROLE=api diagnostic process — proving only that an explicitly
				// Api-pinned process has the Api allowlist, nothing about what the real CLI
				// actually launched. Find the ACTUAL running dotnet process bound to this port
				// and read ITS real, resolved OS environment before asserting or probing
				// anything, so a regression in main()'s role selection is directly observed,
				// not assumed away.
				const realHostPid = findRealApiHostPid(NORMAL_LAUNCH_PORT);
				const realEnv = readRealProcessEnv(realHostPid);

				assert.equal(
					realEnv.APP_ROLE,
					'api',
					'the ACTUAL launched process (pid ' +
						String(realHostPid) +
						') must have been pinned to the Api role in its OWN resolved environment ' +
						'— not asserted against a separately forced diagnostic process',
				);

				// Round-3 review: checking only the Quartz scheduler's own log line let a
				// mutation that registered WorkerHeartbeatService in the Api role WITHOUT
				// Quartz slip through undetected. Assert the COMPLETE resolved hosted-service
				// set, driven by the REAL process's own observed env (not a hard-coded
				// assumption), instead of one log line — any unexpected service, named or not,
				// now fails this.
				const resolvedHostedServices = runHostedServiceManifestProbe({
					appRole: realEnv.APP_ROLE,
					trustedProxyCidrs: realEnv.TRUSTED_PROXY_CIDRS ?? TRUSTED_PROXY_CIDRS,
					connectionString:
						realEnv.POSTGRES_CONNECTION_STRING ?? TEST_CONNECTION,
				});
				assert.deepEqual(
					[...resolvedHostedServices].sort((a, b) => a.localeCompare(b)),
					ALLOWED_API_ROLE_HOSTED_SERVICES,
					'an ordinary review-api launch must resolve to EXACTLY the allowlisted Api-role ' +
						'hosted-service set — no job/worker service (queue processor/listener, ' +
						'scheduler, monitor, heartbeat, outbox dispatcher), named or not, may be ' +
						'present; role selection must not depend on whether a migration is pending',
				);

				const readyUrl = `http://127.0.0.1:${String(NORMAL_LAUNCH_PORT)}${READINESS_PATH}`;
				const readinessResponse = await fetch(readyUrl, {
					signal: AbortSignal.timeout(5000),
				});
				assert.equal(
					readinessResponse.status,
					200,
					'the database is fully migrated by this point, so a genuine api-role launch must report healthy',
				);
			} finally {
				killProcessGroup(child, NORMAL_LAUNCH_PORT);
			}
		});
	},
);

// ---------------------------------------------------------------------------
// Round-3 review IMPORTANT: the current main() path is safe (it reads the worktree file and
// exits when POSTGRES_CONNECTION_STRING is missing), but no test owned that invariant — only
// the pure parser's absent-key return was covered. Reviewer's own mutation ("fall back to
// the ambient process.env.POSTGRES_CONNECTION_STRING when the file key is absent")
// reintroduces the central round-2 hazard specifically for the missing-value case: the guard
// and child could silently target the reviewer's ambient database instead of failing closed.
// ---------------------------------------------------------------------------

const MISSING_VALUE_PORT = 5595;
const MISSING_VALUE_TIMEOUT_MS = 30_000;

test(
	'END-TO-END: a worktree file missing POSTGRES_CONNECTION_STRING fails closed instead of falling back to an ambient decoy',
	{ skip: skip && 'Docker is required for this test' },
	async () => {
		await withWorktreeConnectionStringRemoved(async () => {
			const free = await isPortFree(MISSING_VALUE_PORT);
			assert.equal(
				free,
				true,
				'the test port must be free before spawning the real CLI',
			);

			// Async + detached (own process group) + bounded wait, NOT spawnSync(..., {
			// timeout }) — see killAndReapProcessGroup's comment for why the synchronous form
			// cannot be trusted to terminate a regressed launch on its own.
			const child = spawn(
				'node',
				[
					'scripts/review-api.mjs',
					'1016',
					'--port',
					String(MISSING_VALUE_PORT),
				],
				{
					cwd: repoRoot,
					detached: true,
					stdio: ['ignore', 'pipe', 'pipe'],
					env: {
						...process.env,
						// A valid, reachable, fully migrated ambient decoy. If the launcher ever
						// silently fell back to it instead of failing closed on the missing file
						// value, this would let it start rather than error — the exact hazard this
						// test exists to catch.
						POSTGRES_CONNECTION_STRING: AMBIENT_DECOY_CONNECTION,
					},
				},
			);

			let stdout = '';
			let stderr = '';
			child.stdout.on('data', (chunk) => {
				stdout += chunk;
			});
			child.stderr.on('data', (chunk) => {
				stderr += chunk;
			});

			try {
				const outcome = await Promise.race([
					once(child, 'exit').then(([code]) => ({ code, timedOut: false })),
					new Promise((resolve) => {
						setTimeout(
							() => resolve({ code: null, timedOut: true }),
							MISSING_VALUE_TIMEOUT_MS,
						);
					}),
				]);

				assert.equal(
					outcome.timedOut,
					false,
					'the launcher must fail closed and exit ON ITS OWN within the bound instead ' +
						'of launching against the ambient decoy and hanging past it — ' +
						`stdout so far: ${stdout} stderr so far: ${stderr}`,
				);
				assert.notEqual(
					outcome.code,
					0,
					'must fail closed rather than silently launching against the ambient decoy; ' +
						`stdout: ${stdout} stderr: ${stderr}`,
				);
				assert.match(
					stderr,
					/POSTGRES_CONNECTION_STRING is missing from/,
					'must report the specific file-value-missing error, not some other failure — ' +
						`stderr: ${stderr}`,
				);
			} finally {
				await killAndReapProcessGroup(child, MISSING_VALUE_PORT);
			}

			const stillFree = await isPortFree(MISSING_VALUE_PORT);
			assert.equal(
				stillFree,
				true,
				'no listener may remain on the requested port after failing closed',
			);
		});
	},
);
