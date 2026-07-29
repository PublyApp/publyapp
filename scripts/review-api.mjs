#!/usr/bin/env node

import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { copyFileSync, existsSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:net';
import path from 'node:path';
import process from 'node:process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

import {
	GH_AUTH_FAILURE,
	GH_INVOCATION_FAILURE,
	GH_NETWORK_FAILURE,
	parseWorktrees,
	parseTrackedChangesFromStatus,
	getBranchPathByMap,
	resolveTarget,
	runIssueByNumber,
	runPrByNumber,
} from './review-worktree.resolve.mjs';

// API's documented default port (see AGENTS.md "Development Environment").
const DEFAULT_PORT = 5000;
const ENV_FILE = '.env.development';
const HEALTH_PATH = '/health';
const ALLOW_MIGRATIONS_FLAG = '--allow-migrations';

// Mirrors the default AppEnvironment.cs falls back to when TRUSTED_PROXY_CIDRS is unset
// (apps/api/Lib/AppEnvironment.cs, GetOptionalCsvList(nameof(TRUSTED_PROXY_CIDRS), ...)).
// A fresh worktree's .env.development may not carry this line at all (#1016). Supplying the
// same default inline keeps the guard's dotnet-ef invocation working without requiring a
// manual env edit, and matches exactly what the app itself would have defaulted to.
const DEFAULT_TRUSTED_PROXY_CIDRS = '127.0.0.1/32,::1/128';

// Bounded so a stuck build/restore/connection attempt cannot hang the launcher forever.
// Builds get a longer ceiling (cold-cache dotnet build can genuinely take a few minutes);
// everything else (git, gh, dotnet-ef list) is expected to be fast.
const DEFAULT_COMMAND_TIMEOUT_MS = 60_000;
const BUILD_COMMAND_TIMEOUT_MS = 10 * 60_000;
const REDACTED = '[REDACTED]';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const rootRepoCache = { path: null };
const requestedArgs = process.argv.slice(2);
const hasInteractiveTerminal = process.stdin.isTTY && process.stdout.isTTY;

const err = (message) => {
	console.error(message);
	process.exit(1);
};

// Replaces every occurrence of each non-empty value in `secrets` with a fixed marker.
// Used to keep a connection string's password out of any rendered command error —
// whether the secret leaked into argv, stdout, or stderr.
export const redactSecrets = (text, secrets = []) => {
	let redacted = text;
	for (const secret of secrets) {
		if (typeof secret === 'string' && secret.length > 0) {
			redacted = redacted.split(secret).join(REDACTED);
		}
	}

	return redacted;
};

// Exported so the bounded-timeout behavior can be tested directly against a real
// subprocess, not a mock of spawnSync's option-handling.
export const runCommand = (command, args, options = {}) => {
	const secrets = options.secrets ?? [];
	const result = spawnSync(command, args, {
		cwd: options.cwd,
		env: { ...process.env, ...(options.env ?? {}) },
		encoding: 'utf8',
		stdio: options.stdio ?? 'pipe',
		timeout: options.timeout ?? DEFAULT_COMMAND_TIMEOUT_MS,
	});

	if (result.error) {
		if (typeof result.error.message === 'string') {
			result.error.message = redactSecrets(result.error.message, secrets);
		}

		throw result.error;
	}

	// spawnSync sets status to null (not just absent) both on a normal signal-kill and on
	// a timeout; treating that as a non-zero exit means a timed-out command fails closed
	// through the exact same throw path as any other command failure.
	const status = result.status ?? -1;
	if (status !== 0) {
		const stderr = redactSecrets(String(result.stderr ?? '').trim(), secrets);
		const stdout = redactSecrets(String(result.stdout ?? '').trim(), secrets);
		const prefix = options.label ? `${options.label}: ` : '';
		const detail = stderr || stdout ? `\n${stderr || stdout}` : '';
		const renderedArgs = redactSecrets(args.join(' '), secrets);
		const timedOut = result.signal && !result.status ? ' (timed out)' : '';
		throw new Error(
			`${prefix}${command} ${renderedArgs} exited with status ${String(status)}${timedOut} ${detail}`,
		);
	}

	return {
		stdout: String(result.stdout ?? ''),
		stderr: String(result.stderr ?? ''),
		status,
	};
};

const runCommandOptional = (command, args, options = {}) => {
	try {
		return runCommand(command, args, options);
	} catch (error) {
		return {
			status: -1,
			stdout: '',
			stderr: String(error?.message ?? ''),
			error,
		};
	}
};

export const parseArgs = (args) => {
	let requestedRef = '';
	let port = DEFAULT_PORT;
	let allowMigrations = false;

	for (let index = 0; index < args.length; index += 1) {
		const argument = args[index];
		if (argument === '--port') {
			const requestedPort = args[index + 1];
			if (!requestedPort) {
				err('Missing value for --port.');
			}

			index += 1;
			const parsed = Number.parseInt(requestedPort, 10);
			if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65_535) {
				err(`Invalid --port value: ${requestedPort}.`);
			}

			port = parsed;
			continue;
		}

		if (argument.startsWith('--port=')) {
			const requestedPort = argument.slice('--port='.length);
			const parsed = Number.parseInt(requestedPort, 10);
			if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65_535) {
				err(`Invalid --port value: ${requestedPort}.`);
			}

			port = parsed;
			continue;
		}

		if (argument === ALLOW_MIGRATIONS_FLAG) {
			allowMigrations = true;
			continue;
		}

		if (requestedRef.length === 0) {
			requestedRef = argument;
			continue;
		}

		if (argument.startsWith('--')) {
			err(`Unknown option: ${argument}`);
		}
	}

	return { requestedRef, port, allowMigrations };
};

const getWorktrees = () => {
	const output = runCommand('git', ['worktree', 'list', '--porcelain'], {
		cwd: repoRoot,
	}).stdout;

	return parseWorktrees(output);
};

const getRootClonePath = () => {
	if (rootRepoCache.path) {
		return rootRepoCache.path;
	}

	const result = runCommand(
		'git',
		['rev-parse', '--path-format=absolute', '--git-common-dir'],
		{ cwd: repoRoot },
	);
	const gitCommonDir = result.stdout.trim();
	if (!gitCommonDir) {
		rootRepoCache.path = repoRoot;
		return rootRepoCache.path;
	}

	const commonDir = path.resolve(gitCommonDir);
	rootRepoCache.path = path.resolve(commonDir, '..');
	return rootRepoCache.path;
};

const isHardlinkToSource = (source, destination) => {
	const sourceStats = statSync(source);
	const destinationStats = statSync(destination);
	if (
		destinationStats.dev === sourceStats.dev &&
		destinationStats.ino === sourceStats.ino
	) {
		return true;
	}

	return destinationStats.nlink > 1;
};

const ensureEnvCopy = (worktreePath) => {
	const source = path.join(getRootClonePath(), ENV_FILE);
	const target = path.join(worktreePath, ENV_FILE);

	if (!existsSync(source)) {
		err(
			`Missing ${source}; copy .env.example to .env.development in the root clone before continuing.`,
		);
	}

	if (!existsSync(target)) {
		copyFileSync(source, target);
		console.log(`Copied ${source} -> ${target}.`);
		return;
	}

	if (isHardlinkToSource(source, target)) {
		err(
			`Refusing to proceed: ${target} is linked to ${source}. ` +
				'Copying would rewrite the root clone file. Use a standalone worktree env file.',
		);
	}

	console.log(`Using existing ${target}; leaving it unchanged.`);
};

const isPortAvailableOnHost = async (host, port) => {
	return await new Promise((resolve) => {
		const server = createServer();
		server.once('error', () => {
			resolve(false);
		});
		server.listen(port, host, () => {
			server.close(() => {
				resolve(true);
			});
		});
	});
};

const ensurePortOpen = async (port, { host = '127.0.0.1' } = {}) => {
	const available = await isPortAvailableOnHost(host, port);
	if (!available) {
		err(
			`Port ${String(
				port,
			)} is already in use. The root clone's API or another review launcher is likely running.\n` +
				'Stop that process, or run with --port <n> to force a different port.',
		);
	}
};

const trackedChanges = (worktreePath) => {
	const output = runCommand(
		'git',
		['-C', worktreePath, 'status', '--short', '--untracked-files=no'],
		{
			stdio: 'pipe',
		},
	).stdout;

	return parseTrackedChangesFromStatus(output);
};

const askChoice = async (title, rows) => {
	console.log(title);
	rows.forEach((row, index) => {
		console.log(`${index + 1}. ${row}`);
	});

	if (!hasInteractiveTerminal) {
		err('Interactive selection required but terminal is not interactive.');
	}

	const rl = createInterface({
		input: process.stdin,
		output: process.stdout,
	});

	const selected = await new Promise((resolve) => {
		rl.question(`Select 1-${rows.length}: `, (input) => {
			rl.close();
			resolve(input.trim());
		});
	});

	const index = Number.parseInt(selected, 10);
	if (!Number.isInteger(index) || index < 1 || index > rows.length) {
		err(`Invalid selection: ${selected}`);
	}

	return index - 1;
};

// ---------------------------------------------------------------------------
// Env-file helpers (small + pure, so the migration guard's plumbing is testable
// without touching a real filesystem).
// ---------------------------------------------------------------------------

// Extracts `KEY="value"` or `KEY=value` from a .env-style file's raw content.
// Returns undefined when the key is absent, commented out, or blank.
export const extractEnvValue = (content, key) => {
	const pattern = new RegExp(`^${key}=(.*)$`, 'm');
	const match = pattern.exec(content);
	if (!match) {
		return undefined;
	}

	const raw = match[1].trim();
	const unquoted = raw.replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');
	return unquoted.length > 0 ? unquoted : undefined;
};

// Resolves the TRUSTED_PROXY_CIDRS value a worktree's own .env.development carries,
// falling back to AppEnvironment's own default when the line is missing (#1016: fresh
// worktrees don't carry it at all). Never requires editing the worktree's env file.
export const resolveTrustedProxyCidrs = (envFileContent) => {
	return (
		extractEnvValue(envFileContent, 'TRUSTED_PROXY_CIDRS') ??
		DEFAULT_TRUSTED_PROXY_CIDRS
	);
};

const readWorktreeEnvFile = (worktreePath) => {
	const envPath = path.join(worktreePath, ENV_FILE);
	if (!existsSync(envPath)) {
		err(`Missing ${envPath}; run ensureEnvCopy first.`);
	}

	return readFileSync(envPath, 'utf8');
};

// ---------------------------------------------------------------------------
// Migration guard (owner decision, 2026-07-29): use the shared dev database, but
// refuse to start when this worktree's branch carries a migration the database has
// not applied. `dotnet ef migrations list --json` (POSTGRES_CONNECTION_STRING supplied
// via env, not argv — see listMigrationsJson) reports each migration compiled into the
// branch alongside whether it is applied to whatever database that connection string
// points at.
// ---------------------------------------------------------------------------

const createIndeterminateError = (message) => {
	const error = new Error(
		`${message} Refusing to start — an indeterminate migration state is not a safe one.`,
	);
	error.code = 'MIGRATION_GUARD_INDETERMINATE';
	return error;
};

// Fails closed on anything that isn't unambiguously "here is the full migration list and
// each one's applied state". dotnet-ef 10.0.2 can exit 0 with every entry's `applied` set
// to `null` when the database is unreachable (verified independently in review) — keeping
// only `applied === false` entries would silently treat that as "nothing pending" and let
// the API launch. A non-empty array of entries, each with a non-empty string `id` and a
// boolean `applied`, is the only shape trusted here; anything else throws
// MIGRATION_GUARD_INDETERMINATE instead of resolving to an empty pending list.
export const validateMigrationEntries = (parsed) => {
	if (!Array.isArray(parsed) || parsed.length === 0) {
		throw createIndeterminateError(
			`dotnet-ef reported ${Array.isArray(parsed) ? 'zero migrations' : 'a non-array result'}, but this branch always has at least one (Init).`,
		);
	}

	for (const entry of parsed) {
		const hasValidId =
			entry !== null &&
			typeof entry === 'object' &&
			typeof entry.id === 'string' &&
			entry.id.length > 0;
		const hasValidApplied =
			entry !== null &&
			typeof entry === 'object' &&
			typeof entry.applied === 'boolean';

		if (!hasValidId || !hasValidApplied) {
			throw createIndeterminateError(
				`dotnet-ef reported a migration entry with an unrecognized shape: ${JSON.stringify(entry)}.`,
			);
		}
	}

	return parsed;
};

export const extractPendingMigrationIds = (migrationEntries) => {
	return migrationEntries
		.filter((entry) => entry.applied === false)
		.map((entry) => entry.id);
};

export const formatMigrationGuardError = (pendingMigrationIds) => {
	const list = pendingMigrationIds.map((id) => `  - ${id}`).join('\n');
	const pronoun = pendingMigrationIds.length > 1 ? 'them' : 'it';
	return [
		"Refusing to start: this worktree's branch carries migration(s) the shared",
		'development database has not applied:',
		list,
		'',
		'Starting anyway would let a later `just db-migrate` silently apply these to the',
		'database every other worktree uses, with no undo short of a reset and reseed.',
		`Run \`just db-migrate\` in this worktree first if you want everyone to get ${pronoun},`,
		`or re-run with ${ALLOW_MIGRATIONS_FLAG} to start anyway, knowing what you are agreeing to.`,
	].join('\n');
};

// Reports what assertNoPendingMigrations actually returned, not an unconditional success
// message — with --allow-migrations, `pending` can be non-empty, and printing "nothing
// pending" right after the warning above it would be a straightforwardly false status.
export const formatMigrationGuardStatusMessage = (pendingMigrationIds) => {
	if (pendingMigrationIds.length === 0) {
		return 'Migration guard: nothing pending.';
	}

	return `Migration guard: bypassed ${pendingMigrationIds.length} pending migration(s): ${pendingMigrationIds.join(', ')}`;
};

// Builds once (doc-gen disabled — see #1006/AGENTS.md) then asks dotnet-ef for the
// migration list + applied state against the given connection string. The connection
// string travels ONLY via the child's environment (POSTGRES_CONNECTION_STRING), never as
// a CLI argument — argv is visible to any same-host process inspection (`ps`, /proc),
// while an env var is only visible via /proc/<pid>/environ to the same user or root. It
// is also passed to `secrets` so it gets redacted out of any error this command raises
// (a malformed connection string can otherwise echo its own password back in the
// exception text). Exported with an injectable `runCommand` so unit tests can stub it;
// the migration-guard proof itself must call this with the real runner (see
// scripts/review-api.migration-guard.integration.test.mjs).
export const listMigrationsJson = ({
	apiDir,
	connectionString,
	trustedProxyCidrs,
	run = runCommand,
}) => {
	const env = {
		APP_ROLE: 'api',
		TRUSTED_PROXY_CIDRS: trustedProxyCidrs,
		POSTGRES_CONNECTION_STRING: connectionString,
	};
	const secrets = [connectionString];

	run('dotnet', ['build', '-property:OpenApiGenerateDocuments=false'], {
		cwd: apiDir,
		env,
		label: 'dotnet build',
		timeout: BUILD_COMMAND_TIMEOUT_MS,
		secrets,
	});

	const result = run(
		'dotnet',
		['tool', 'run', 'dotnet-ef', 'migrations', 'list', '--no-build', '--json'],
		{ cwd: apiDir, env, label: 'dotnet-ef migrations list', secrets },
	);

	let parsed;
	try {
		parsed = JSON.parse(result.stdout);
	} catch (error) {
		// Only the parser's own message (token/position), never the raw stdout — it could
		// otherwise echo a connection failure preamble containing the connection string.
		throw createIndeterminateError(
			`dotnet-ef output could not be parsed as JSON: ${String(error?.message ?? error)}.`,
		);
	}

	return validateMigrationEntries(parsed);
};

// Throws a MIGRATION_GUARD_BLOCKED error naming the pending migration(s) unless
// `allowMigrations` is set, in which case it warns and returns them instead.
export const assertNoPendingMigrations = ({
	apiDir,
	connectionString,
	trustedProxyCidrs,
	allowMigrations,
	run = runCommand,
}) => {
	const entries = listMigrationsJson({
		apiDir,
		connectionString,
		trustedProxyCidrs,
		run,
	});
	const pending = extractPendingMigrationIds(entries);

	if (pending.length === 0) {
		return { pending };
	}

	if (!allowMigrations) {
		const error = new Error(formatMigrationGuardError(pending));
		error.code = 'MIGRATION_GUARD_BLOCKED';
		error.pending = pending;
		throw error;
	}

	console.error(
		`Warning: proceeding with ${pending.length} unapplied migration(s) (${ALLOW_MIGRATIONS_FLAG}):`,
	);
	for (const id of pending) {
		console.error(`  - ${id}`);
	}

	return { pending };
};

// ---------------------------------------------------------------------------
// Launch
// ---------------------------------------------------------------------------

// Exported (not just used inline) so the end-to-end test can poll the exact same way the
// real launcher does, instead of inventing its own readiness check.
export const waitForApiReachable = async (
	url,
	{ attempts = 60, intervalMs = 250, timeoutMs = 1000 } = {},
) => {
	for (let attempt = 0; attempt < attempts; attempt += 1) {
		try {
			await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
			return true;
		} catch {
			await new Promise((resolve) => {
				setTimeout(resolve, intervalMs);
			});
		}
	}

	return false;
};

// The env a launched API child gets. `forceApiRole` pins APP_ROLE=api regardless of what
// .env.development says (default "all" — see AGENTS.md), which is required precisely when
// --allow-migrations is in effect: WorkerMigrationStartupGate is registered for the
// Worker/All roles and deliberately fails fast on a pending migration in Development
// (apps/api/Infrastructure/Jobs/WorkerMigrationStartupGate.cs), so an All-role process
// would immediately crash on the very migration state the reviewer just chose to accept.
// The Api role never registers that gate at all (apps/api/Program.cs), so it starts
// regardless. This only takes effect because of the #1019 NoClobber fix
// (apps/api/Lib/AppEnvironment.cs) — without it, .env.development's APP_ROLE="all" would
// silently overwrite this value back, and the escape hatch would still not work end to
// end (verified empirically; see the commit history for #1016).
export const buildApiChildEnv = ({
	trustedProxyCidrs,
	forceApiRole = false,
	connectionStringOverride,
} = {}) => {
	const env = { ...process.env, TRUSTED_PROXY_CIDRS: trustedProxyCidrs };
	if (forceApiRole) {
		env.APP_ROLE = 'api';
	}

	if (connectionStringOverride) {
		env.POSTGRES_CONNECTION_STRING = connectionStringOverride;
	}

	return env;
};

// Spawns the API child without waiting on it — split out from launchApi so a test can
// assert readiness/liveness itself and control shutdown, rather than being stuck inside a
// promise that only resolves once the child has already exited.
export const spawnApiChild = (worktreePath, port, options = {}) => {
	const cwd = path.join(worktreePath, 'apps', 'api');
	const publicUrl = `http://127.0.0.1:${String(port)}`;
	const child = spawn(
		'dotnet',
		[
			'watch',
			'run',
			'--no-restore',
			'-property:OpenApiGenerateDocuments=false',
			'--urls',
			publicUrl,
		],
		{
			cwd,
			stdio: 'inherit',
			env: buildApiChildEnv(options),
		},
	);

	return { child, publicUrl };
};

const launchApi = async (worktreePath, port, options) => {
	const { child, publicUrl } = spawnApiChild(worktreePath, port, options);

	const shutdown = (signal) => {
		if (!child.killed) {
			child.kill(signal);
		}
	};
	process.on('SIGINT', () => shutdown('SIGINT'));
	process.on('SIGTERM', () => shutdown('SIGTERM'));

	const reachable = await waitForApiReachable(`${publicUrl}${HEALTH_PATH}`);
	if (!reachable) {
		err(
			`API did not become reachable at ${publicUrl}${HEALTH_PATH} before timeout.`,
		);
	}

	const [code, signal] = await once(child, 'exit');

	if (signal) {
		console.log(`API exited on ${signal}.`);
		return { signal };
	}

	return { code };
};

const main = async () => {
	const { requestedRef, port, allowMigrations } = parseArgs(requestedArgs);
	const worktrees = getWorktrees();
	const byBranch = getBranchPathByMap(worktrees);
	const runGh = async (args) =>
		runCommandOptional('gh', args, {
			cwd: repoRoot,
			label: 'gh',
		});

	const resolved = await resolveTarget(worktrees, byBranch, {
		requestedRef,
		hasInteractiveTerminal,
		askChoice,
		runPrByNumber: (number) => runPrByNumber(number, { runGh }),
		runIssueByNumber: (number) => runIssueByNumber(number, { runGh }),
		runGh,
	});

	const worktree = resolved?.worktree;
	if (!worktree?.path) {
		if (resolved?.kind === 'not-found') {
			err(
				`No PR or issue found for ${String(
					resolved.requested,
				)}. Add this PR to a local worktree first.`,
			);
		}

		if (resolved?.kind === 'issue-ambiguous') {
			const candidates = resolved.worktrees.map((w) => w.path).join('\n  ');
			err(
				`Issue ${String(
					resolved.requested,
				)} matched multiple worktrees; pick the target directly by PR number or by path.\n  ${candidates}`,
			);
		}

		if (resolved?.kind === 'pr-unmatched') {
			err(`Could not resolve PR #${resolved.requested} to a local worktree.`);
		}

		err(`Could not determine worktree for ${String(requestedRef)}.`);
	}

	await ensurePortOpen(port);
	ensureEnvCopy(worktree.path);

	const envFileContent = readWorktreeEnvFile(worktree.path);
	const connectionString = extractEnvValue(
		envFileContent,
		'POSTGRES_CONNECTION_STRING',
	);
	if (!connectionString) {
		err(
			`POSTGRES_CONNECTION_STRING is missing from ${path.join(worktree.path, ENV_FILE)}.`,
		);
	}

	const trustedProxyCidrs = resolveTrustedProxyCidrs(envFileContent);
	const apiDir = path.join(worktree.path, 'apps', 'api');

	console.log(
		'Checking for unapplied migrations against the shared dev database...',
	);
	const guardResult = assertNoPendingMigrations({
		apiDir,
		connectionString,
		trustedProxyCidrs,
		allowMigrations,
	});
	// Pin the Api role only when we are actually bypassing a real pending migration — the
	// only condition that reaches here with a non-empty pending list (assertNoPendingMigrations
	// throws otherwise). Every other launch keeps .env.development's default ("all"), so a
	// normal review session still gets the worker/job engine, matching `just dev-api`.
	const forceApiRole = guardResult.pending.length > 0;
	console.log(formatMigrationGuardStatusMessage(guardResult.pending));

	console.log('\n');
	console.log('Launching PR API review server');
	console.log(`worktree: ${worktree.path}`);
	console.log(`open:     http://localhost:${String(port)}${HEALTH_PATH}`);
	console.log(
		`Tip: keep a second terminal for the frontend (just review-front) while both sessions run.`,
	);
	console.log('');

	const beforeDirty = trackedChanges(worktree.path);
	const { code, signal } = await launchApi(worktree.path, port, {
		trustedProxyCidrs,
		forceApiRole,
	});
	const afterDirty = trackedChanges(worktree.path);
	const newlyDirty = [...afterDirty].filter((entry) => !beforeDirty.has(entry));

	if (newlyDirty.length > 0) {
		console.error('Warning: tracked files became dirty while the session ran.');
		for (const entry of newlyDirty) {
			console.error(`  ${entry}`);
		}
	}

	if (signal) {
		process.exit(0);
	}

	if (code !== 0) {
		err(`API exited with code ${String(code)}.`);
	}
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	try {
		await main();
	} catch (error) {
		switch (error?.code) {
			case GH_AUTH_FAILURE: {
				err(`${error.message}\nRun: gh auth login`);
				break;
			}

			case GH_NETWORK_FAILURE:
			case GH_INVOCATION_FAILURE: {
				err(error.message);
				break;
			}

			case 'MIGRATION_GUARD_BLOCKED':
			case 'MIGRATION_GUARD_INDETERMINATE': {
				err(error.message);
				break;
			}

			default: {
				err(error?.message ?? String(error));
			}
		}
	}
}
