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
	LAUNCHED_API_CHILD_PID_PREFIX,
	waitForApiReachable,
} from './review-api.ts';

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

// ---------------------------------------------------------------------------
// Process-tree helpers (Linux-only /proc, consistent with the rest of this file's POSIX-only
// process handling — Docker-gated anyway).
//
// Round-5 review cleanup finding + BLOCKER: every kill-time backstop in this file used to be a
// global `pkill -9 -f <pattern>` sweep across the WHOLE host — a substring match against every
// process's argv, not scoped to anything this test actually spawned. Reviewer reproduced this
// killing the test harness's own parent shell (whose argv happened to also contain the port
// substring), aborting cleanup and orphaning the real API. These helpers replace every such
// sweep with kills scoped to PIDs PROVEN (via /proc's own parent-pid chain) to descend from a
// specific PID this file itself spawned — never a pattern that could also match an unrelated
// process elsewhere on a host that runs concurrent dotnet/dotnet-watch processes.
// ---------------------------------------------------------------------------

// Builds a pid -> ppid map from every process currently visible under /proc. A process that
// exits between readdir and the individual read is just skipped (it is, definitionally, no
// longer anything that needs reaping).
const readProcessParentMap = () => {
	const parentByPid = new Map();
	for (const entry of readdirSync('/proc')) {
		if (!/^\d+$/.test(entry)) {
			continue;
		}

		try {
			const stat = readFileSync(`/proc/${entry}/stat`, 'latin1');
			// proc(5): the second field (`comm`) is parenthesized and may itself contain spaces
			// or parens, so the LAST ')' in the line is the only safe anchor — everything after
			// it is space-separated fields in a fixed, documented order, starting with `state`
			// then `ppid`.
			const afterComm = stat.slice(stat.lastIndexOf(')') + 2);
			const ppid = Number.parseInt(afterComm.split(' ')[1], 10);
			if (Number.isInteger(ppid)) {
				parentByPid.set(Number.parseInt(entry, 10), ppid);
			}
		} catch {
			// Process exited between readdir and read — fine, just skip it.
		}
	}

	return parentByPid;
};

// Every pid descended from rootPid (any depth), INCLUDING rootPid itself, as of THIS instant.
// Callers that intend to kill a tree should snapshot this BEFORE signaling anything: a process
// that re-parents away mid-kill (e.g. a re-forking watcher detaching a new child) would no
// longer appear as a descendant in a snapshot taken afterward, but one taken before still names
// it by pid, independent of who its parent becomes later.
// @ts-expect-error rung-0: add proper type in later rung
const descendantPidsOf = (rootPid) => {
	const parentByPid = readProcessParentMap();
	const result = new Set([rootPid]);

	let added = true;
	while (added) {
		added = false;
		for (const [pid, ppid] of parentByPid.entries()) {
			if (result.has(ppid) && !result.has(pid)) {
				result.add(pid);
				added = true;
			}
		}
	}

	return result;
};

// Kills every pid in a previously-snapshotted descendant set directly, individually — never a
// pattern sweep. Missing/already-exited pids (ESRCH) are expected and ignored.
// @ts-expect-error rung-0: add proper type in later rung
const killPidsDirectly = (pids) => {
	for (const pid of pids) {
		try {
			process.kill(pid, 'SIGKILL');
		} catch {
			// Already gone — fine.
		}
	}
};

// Every CLI child pid this file has spawned, tracked so the `after` hook's backstop can reap by
// proven descendant pid instead of a global argv pattern (see the header comment above).
const trackedLaunchChildPids = new Set();

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
// @ts-expect-error rung-0: add proper type in later rung
const isTcpPortReachable = (port, host = '127.0.0.1') =>
	new Promise((resolve) => {
		const socket = createConnection({ port, host });
		// @ts-expect-error rung-0: add proper type in later rung
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
//
// Round-5 review IMPORTANT: without an explicit `-h`, libpq defaults to the container's Unix
// domain socket — and the official postgres image deliberately starts a SOCKET-ONLY temporary
// server during initdb (the exact round-2 temporary-server phase, reachable this time because
// this check runs INSIDE the container instead of from the host). An authenticated query
// against that temporary server can succeed even though the real, network-facing server has
// not taken over yet, so the round-4 fix above traded one "returned too early" bug for another.
// Forcing `-h 127.0.0.1` makes psql dial TCP loopback INSIDE the container instead — the
// temporary server never binds TCP at all (by design, so external callers cannot reach it), so
// only the final, real server can ever answer this specific query.
const isPostgresAcceptingAuthenticatedSessions = () => {
	const result = spawnSync(
		'docker',
		[
			'exec',
			'-e',
			'PGPASSWORD=password',
			TEST_CONTAINER,
			'psql',
			'-h',
			'127.0.0.1',
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
	// @ts-expect-error rung-0: add proper type in later rung
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
			// @ts-expect-error rung-0: TS18048
			`stdout:\n${lastResult.stdout}\nstderr:\n${lastResult.stderr}`,
	);
};

// @ts-expect-error rung-0: add proper type in later rung
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

	// Backstop in case a launch test's own try/finally never got to run (e.g. the process was
	// killed externally mid-test): reap every descendant of every CLI pid this file spawned,
	// by proven pid — never a global argv pattern sweep (see the process-tree helpers' header
	// comment above the reason).
	for (const rootPid of trackedLaunchChildPids) {
		killPidsDirectly(descendantPidsOf(rootPid));
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
				// @ts-expect-error rung-0: TS18046
				assert.equal(error.code, 'MIGRATION_GUARD_BLOCKED');
				// @ts-expect-error rung-0: TS18046
				assert.deepEqual(error.pending, [lastMigrationId]);
				// @ts-expect-error rung-0: TS18046
				assert.match(error.message, new RegExp(lastMigrationId));
				// @ts-expect-error rung-0: TS18046
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

// @ts-expect-error rung-0: add proper type in later rung
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

// @ts-expect-error rung-0: add proper type in later rung
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
// @ts-expect-error rung-0: add proper type in later rung
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

// @ts-expect-error rung-0: add proper type in later rung
const killProcessGroup = (child) => {
	// Snapshot descendants BEFORE signaling — see the process-tree helpers' header comment for
	// why this must happen first (a descendant that re-parents away mid-kill is still caught by
	// pid here, where a sweep taken afterward could miss it).
	const descendantPidsBeforeKill = descendantPidsOf(child.pid);

	if (child.exitCode === null && !child.killed) {
		try {
			process.kill(-child.pid, 'SIGKILL');
		} catch {
			// Already gone.
		}
	}

	// Backstop for anything that escaped the process-group signal above — kills each
	// individually-tracked descendant pid directly. Never a global `pkill -f` pattern sweep
	// (round-5 review: that killed the test harness's own parent shell, whose argv happened to
	// also contain the port substring, aborting cleanup and orphaning the real API).
	killPidsDirectly(descendantPidsBeforeKill);
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
// must not mask a real assertion failure), then reaps any snapshotted descendant pid directly
// as a backstop for anything that re-parented outside the group.
//
// Round-5 review cleanup finding: the backstop used to be a global `pkill -f <port pattern>`
// sweep — reproduced killing the test harness's own parent shell, whose argv happened to also
// contain the port substring, which prevented this very `finally` block's caller from running
// and orphaned the real API. Snapshotting descendants of `child.pid` BEFORE signaling and
// killing exactly those pids removes the pattern match entirely.
// @ts-expect-error rung-0: add proper type in later rung
const killAndReapProcessGroup = async (child, { graceMs = 5000 } = {}) => {
	const stillRunning = () =>
		child.exitCode === null && child.signalCode === null && !child.killed;

	// @ts-expect-error rung-0: add proper type in later rung
	const waitForExit = (timeoutMs) =>
		Promise.race([
			once(child, 'exit').then(() => true),
			new Promise((resolve) => {
				setTimeout(() => resolve(false), timeoutMs);
			}),
		]);

	const descendantPidsBeforeKill = descendantPidsOf(child.pid);

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

	killPidsDirectly(descendantPidsBeforeKill);
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

// Round-5 review BLOCKER: this used to REDISCOVER the launched process by pattern-matching
// argv against the WHOLE HOST (`pgrep -f`) — a discovered pid is only ever an inference. The
// reviewer disproved it: an older, non-listening decoy process whose argv happened to match
// the same fixed-port pattern let the search latch onto IT, while the real API — with the
// unsafe conditional-role behavior restored — visibly started Quartz and acquired scheduler
// leadership, and the test still passed 5/5. "No other candidate exists" is not a safe
// assumption on a host that runs concurrent dotnet/dotnet-watch processes (this repo's own
// sibling review/dev lanes do exactly that).
//
// Fixed by making the launcher report its own child pid directly (review-api.mjs prints
// `LAUNCHED_API_CHILD_PID_PREFIX <pid>` — the exact pid Node's own spawn() call just set
// buildApiChildEnv's resolved env on) and reading that reported fact from the CLI's own
// captured stdout, instead of searching for it. A discovered pid can be wrong in three ways —
// zero matches, more than one, or a match that merely looks right; a reported pid removes the
// discovery step entirely, so none of those ambiguities can arise. The only remaining failure
// mode — the reported pid having already exited (and, vanishingly unlikely, been recycled) by
// the time this reads it — is still guarded explicitly below and fails closed rather than
// silently trusting an unverified pid.

// Round-6 review IMPORTANT: this used to run an UNANCHORED regex against the whole
// accumulated stdout buffer and return the FIRST match. The reviewer planted a stale,
// matching decoy marker line before the real one and the ordinary-launch proof still passed
// 2/2 while the real process visibly started Quartz and acquired scheduler leadership — the
// exact regression this proof exists to catch, passing. A reported "fact" is only as
// trustworthy as the code that reads it back out: last round replaced a fragile pattern
// SEARCH with a reported fact; this parser then reintroduced the same ambiguity one layer
// down by searching for that fact instead of verifying it.
//
// Fixed to require the marker be structurally unambiguous, not merely present:
//   - only COMPLETE lines (terminated by '\n') are ever considered — a marker split across
//     chunks, or a trailing partial line still being written, can never match;
//   - the ENTIRE line must be nothing but the marker (anchored ^...$) — a marker embedded
//     inside other output, or preceded/followed by other text, does not count;
//   - EXACTLY ONE such line is required. Zero keeps waiting (bounded, then throws, as
//     before). Two or more throws IMMEDIATELY, without picking one: the production launcher
//     emits this marker exactly once per invocation (review-api.mjs's single `console.log`
//     call at the point it learns its own spawned child's pid), so more than one complete
//     matching line is always a defect — a decoy or a duplicate-emission regression — never
//     a legitimate state to resolve by guessing which one is real.
const LAUNCHED_API_CHILD_PID_LINE_PATTERN = new RegExp(
	`^${LAUNCHED_API_CHILD_PID_PREFIX}\\s*(\\d+)$`,
);

// Waits (bounded) for review-api.mjs's LAUNCHED_API_CHILD_PID_PREFIX marker to appear as its
// own complete, unambiguous line in the CLI's own captured stdout, then parses the reported
// pid out of it. Throws — never falls back to any kind of search, and never guesses among
// multiple candidates — if the marker never appears within the bound, or appears more than
// once.
const waitForReportedLaunchedChildPid = async (
	// @ts-expect-error rung-0: add proper type in later rung
	getStdout,
	{ attempts = 120, intervalMs = 250 } = {},
) => {
	for (let attempt = 0; attempt < attempts; attempt += 1) {
		const raw = getStdout();
		// The final split segment is everything written since the last '\n' — possibly still
		// mid-write — and must never be treated as a complete line. Stripping a trailing '\r'
		// tolerates CRLF output without loosening the anchor itself.
		const lines = raw.split('\n');
		lines.pop();

		const matches = lines
			// @ts-expect-error rung-0: add proper type in later rung
			.map((line) =>
				LAUNCHED_API_CHILD_PID_LINE_PATTERN.exec(line.replace(/\r$/, '')),
			)
			// @ts-expect-error rung-0: add proper type in later rung
			.filter((match) => match !== null);

		if (matches.length > 1) {
			throw new Error(
				'The real CLI reported its launched child pid ' +
					`${String(matches.length)} times (expected EXACTLY ONE ` +
					`"${LAUNCHED_API_CHILD_PID_PREFIX} <pid>" line) — refusing to guess which one ` +
					// @ts-expect-error rung-0: add proper type in later rung
					`is real. Reported pids: ${matches.map((match) => match[1]).join(', ')}. ` +
					`stdout so far:\n${raw}`,
			);
		}

		if (matches.length === 1) {
			return Number.parseInt(matches[0][1], 10);
		}

		await new Promise((resolve) => {
			setTimeout(resolve, intervalMs);
		});
	}

	throw new Error(
		'The real CLI never reported its launched child pid (expected a ' +
			`"${LAUNCHED_API_CHILD_PID_PREFIX} <pid>" line on stdout) within the bound — cannot ` +
			`identify the process under test. stdout so far:\n${getStdout()}`,
	);
};

// ---------------------------------------------------------------------------
// waitForReportedLaunchedChildPid: parser unit tests (round-6 review IMPORTANT).
//
// These do NOT require Docker/dotnet — they exercise the parsing/anchoring/uniqueness logic
// directly against a fake `getStdout`, so the decoy scenario and its variants (duplicate,
// embedded-in-other-text, partial-line) run fast and always (no `skip` gate) rather than only
// as an expensive, Docker-gated end-to-end proof. The reviewer's exact reproduction — a stale
// marker planted before the real one — is also proven at the real CLI level in the
// Docker-gated "ordinary launch" test below; these cover the parser in isolation.
// ---------------------------------------------------------------------------

test('waitForReportedLaunchedChildPid: resolves the pid from exactly one complete marker line', async () => {
	const stdout = `some banner text\n${LAUNCHED_API_CHILD_PID_PREFIX} 4242\nmore log lines\n`;
	const pid = await waitForReportedLaunchedChildPid(() => stdout, {
		attempts: 1,
		intervalMs: 1,
	});
	assert.equal(pid, 4242);
});

test('waitForReportedLaunchedChildPid: a trailing PARTIAL line (no newline yet) never counts — even if it looks like a match', async () => {
	// Simulates a chunk boundary landing mid-marker: the digits are still being written when
	// this poll happens. Must not resolve to a truncated/wrong pid, and must not throw either
	// — it should just keep waiting until the line is actually complete.
	let stdout = `${LAUNCHED_API_CHILD_PID_PREFIX} 99`;
	const completeAfterMs = 10;
	setTimeout(() => {
		stdout += '99\n'; // completes the SAME pid (9999), not a different one
	}, completeAfterMs);

	const pid = await waitForReportedLaunchedChildPid(() => stdout, {
		attempts: 50,
		intervalMs: 2,
	});
	assert.equal(pid, 9999);
});

test('waitForReportedLaunchedChildPid: a marker embedded inside other text on the same line never matches', async () => {
	const stdout = `noisy prefix ${LAUNCHED_API_CHILD_PID_PREFIX} 1234 noisy suffix\n`;
	await assert.rejects(
		() =>
			waitForReportedLaunchedChildPid(() => stdout, {
				attempts: 3,
				intervalMs: 1,
			}),
		/never reported its launched child pid/,
	);
});

test('waitForReportedLaunchedChildPid: zero markers ever emitted fails closed after the bound', async () => {
	const stdout = 'the launcher never printed a marker at all\n';
	await assert.rejects(
		() =>
			waitForReportedLaunchedChildPid(() => stdout, {
				attempts: 3,
				intervalMs: 1,
			}),
		/never reported its launched child pid/,
	);
});

// Round-6 review IMPORTANT reproduction, at the parser level: a stale marker line planted
// before the real one. The OLD unanchored/first-match parser silently accepted the FIRST
// (decoy) pid here; the fix must refuse to pick either.
test('waitForReportedLaunchedChildPid: a stale decoy marker alongside the real one fails closed — never guesses which is real', async () => {
	const decoyPid = 3010830;
	const realPid = 3018301;
	const stdout =
		`${LAUNCHED_API_CHILD_PID_PREFIX} ${String(decoyPid)}\n` +
		`${LAUNCHED_API_CHILD_PID_PREFIX} ${String(realPid)}\n` +
		'[08:02:36 INF] Quartz Scheduler created\n' +
		'[08:02:36 INF] Acquired scheduler leadership; Quartz scheduler started\n';

	await assert.rejects(
		() => waitForReportedLaunchedChildPid(() => stdout, { attempts: 1 }),
		(error) => {
			// @ts-expect-error rung-0: TS18046
			assert.match(error.message, /reported its launched child pid 2 times/);
			// @ts-expect-error rung-0: TS18046
			assert.match(error.message, new RegExp(String(decoyPid)));
			// @ts-expect-error rung-0: TS18046
			assert.match(error.message, new RegExp(String(realPid)));
			return true;
		},
	);
});

test('waitForReportedLaunchedChildPid: TWO IDENTICAL marker lines also fail closed (not just distinct duplicates)', async () => {
	const stdout = `${LAUNCHED_API_CHILD_PID_PREFIX} 5555\n${LAUNCHED_API_CHILD_PID_PREFIX} 5555\n`;
	await assert.rejects(
		() => waitForReportedLaunchedChildPid(() => stdout, { attempts: 1 }),
		/reported its launched child pid 2 times/,
	);
});

// Reads /proc/<pid>/cmdline (NUL-separated argv) for a currently-running process.
// @ts-expect-error rung-0: add proper type in later rung
const readProcessCmdline = (pid) => {
	const raw = readFileSync(`/proc/${String(pid)}/cmdline`, 'latin1');
	return raw.split('\0').filter(Boolean);
};

// Verifies the launcher-reported pid is genuinely alive and is the expected
// `dotnet watch run ... --urls http://127.0.0.1:<port>` process BEFORE anything trusts its
// environment — belt-and-suspenders against the pid having already exited (and, in principle,
// been recycled) by the time this runs. A mismatch throws; it never silently reads the wrong
// process's environment, and it never falls back to searching for a replacement candidate.
// @ts-expect-error rung-0: add proper type in later rung
const verifyReportedApiHostPid = (pid, port) => {
	let argv;
	try {
		argv = readProcessCmdline(pid);
	} catch (error) {
		throw new Error(
			`The real CLI reported pid ${String(pid)} as its launched child, but that process ` +
				// @ts-expect-error rung-0: TS2339
				`no longer exists (${String(error?.message ?? error)}) — refusing to trust its ` +
				'environment.',
		);
	}

	const commandLine = argv.join(' ');
	const expectedUrl = `--urls http://127.0.0.1:${String(port)}`;
	if (argv[0] !== 'dotnet' || !commandLine.includes(expectedUrl)) {
		throw new Error(
			`The real CLI reported pid ${String(pid)} as its launched child, but its actual ` +
				`argv ("${commandLine}") is not the expected dotnet watch process for ` +
				`${expectedUrl} — refusing to trust its environment.`,
		);
	}
};

// Reads the REAL, resolved OS-level environment of an already-running process by PID — the
// exact env block Node's spawn() set at exec time, not a value this test merely assumes was
// used. Linux-only (/proc), consistent with the rest of this file's POSIX-only process-tree
// handling (Docker-gated anyway).
// @ts-expect-error rung-0: add proper type in later rung
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

		// @ts-expect-error rung-0: TS7053
		env[entry.slice(0, separatorIndex)] = entry.slice(separatorIndex + 1);
	}

	return env;
};

// Runs the shipped --print-hosted-services probe using the EXACT env values (APP_ROLE,
// TRUSTED_PROXY_CIDRS, POSTGRES_CONNECTION_STRING) observed on the real launched process —
// never a hard-coded assumption of what the launcher should have passed. Returns the
// resolved hosted-service type names.
const runHostedServiceManifestProbe = ({
	// @ts-expect-error rung-0: add proper type in later rung
	appRole,
	// @ts-expect-error rung-0: add proper type in later rung
	trustedProxyCidrs,
	// @ts-expect-error rung-0: add proper type in later rung
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
			trackedLaunchChildPids.add(child.pid);

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
				killProcessGroup(child);
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

			// stdout is piped (not inherited) so this test can read the launcher's own
			// LAUNCHED_API_CHILD_PID_PREFIX marker directly — see the BLOCKER comment above
			// findRealApiHostPid's replacement for why that beats rediscovering the pid by
			// pattern. Captured chunks are also echoed straight through to this process's own
			// stdout so nothing is lost for a human running this suite by hand; stderr stays
			// inherited.
			let stdout = '';
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
					stdio: ['ignore', 'pipe', 'inherit'],
					detached: true,
					env: { ...process.env },
				},
			);
			trackedLaunchChildPids.add(child.pid);
			child.stdout.on('data', (chunk) => {
				const text = chunk.toString('utf8');
				stdout += text;
				process.stdout.write(text);
			});

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
				// actually launched. Read ITS real, resolved OS environment before asserting or
				// probing anything, so a regression in main()'s role selection is directly
				// observed, not assumed away.
				//
				// Round-5 review BLOCKER: identify that process by the pid the launcher itself
				// reported (a fact), verified alive and matching the expected dotnet-watch
				// command line for this exact port, rather than rediscovering it by a host-wide
				// argv pattern search (an inference that a stale sibling process elsewhere on
				// the host can defeat).
				const realHostPid = await waitForReportedLaunchedChildPid(() => stdout);
				verifyReportedApiHostPid(realHostPid, NORMAL_LAUNCH_PORT);
				const realEnv = readRealProcessEnv(realHostPid);

				assert.equal(
					// @ts-expect-error rung-0: TS2339
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
					// @ts-expect-error rung-0: TS2339
					appRole: realEnv.APP_ROLE,
					// @ts-expect-error rung-0: TS2339
					trustedProxyCidrs: realEnv.TRUSTED_PROXY_CIDRS ?? TRUSTED_PROXY_CIDRS,
					connectionString:
						// @ts-expect-error rung-0: TS2339
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
				killProcessGroup(child);
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
			trackedLaunchChildPids.add(child.pid);

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
					// @ts-expect-error rung-0: TS18046
					outcome.timedOut,
					false,
					'the launcher must fail closed and exit ON ITS OWN within the bound instead ' +
						'of launching against the ambient decoy and hanging past it — ' +
						`stdout so far: ${stdout} stderr so far: ${stderr}`,
				);
				assert.notEqual(
					// @ts-expect-error rung-0: TS18046
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
				await killAndReapProcessGroup(child);
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
