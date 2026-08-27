#!/usr/bin/env node

// API review launcher (#1020): keeps only the app-specific parts — the Npgsql
// connection-string secret parsing, the migration guard against the shared dev database,
// the dotnet watch launch command + readiness check, and user-facing messages. Everything
// application-neutral lives in review-launcher.ts (command execution with secret-aware
// rendering, worktree discovery/root resolution, GitHub execution, port probing, env-file
// copying with hardlink refusal, tracked-file checks, interactive selection, resolution
// error handling, child signal handling, startup/exit plumbing) and is tested there.

import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
	ambientCredentialSecrets,
	ensureEnvCopy,
	err,
	ensurePortOpen,
	forwardTerminationSignals,
	parseLauncherArgs,
	redactSecrets,
	requireResolvedWorktree,
	reportNewlyDirtyFiles,
	resolveReviewTarget,
	runCommand,
	runLauncherCli,
	trackedChanges,
} from './review-launcher.ts';

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
// everything else (git, gh, dotnet-ef list) uses the shared launcher's 60s default.
const BUILD_COMMAND_TIMEOUT_MS = 10 * 60_000;

// Round-5 review BLOCKER: the end-to-end "no job engine starts" proof used to REDISCOVER the
// launched process by pattern-matching argv against the whole host (`pgrep -f`), which can
// latch onto an unrelated, non-listening stale sibling process elsewhere on a host that runs
// concurrent dotnet/dotnet-watch processes — a discovered pid is only ever an inference. This
// prefix lets the launcher report the exact pid Node itself just spawned as a plain fact on
// stdout, so a caller (the integration test) can read it directly instead of guessing.
export const LAUNCHED_API_CHILD_PID_PREFIX = 'LAUNCHED_API_CHILD_PID:';

// Shared-layer command execution + credential sources, re-exported so this module remains
// the single import surface its existing suites rely on (#1020).
export {
	ambientCredentialSecrets,
	redactSecrets,
	runCommand,
} from './review-launcher.ts';

// ---------------------------------------------------------------------------
// Connection-string secrets (Npgsql-specific, deliberately NOT in the shared
// launcher layer — only this launcher renders database credentials)
// ---------------------------------------------------------------------------

// The whitespace a keyword/value pair may carry around its separators, matched precisely
// against real Npgsql 10.0.0 rather than guessed. Round-6 review reproduced a leak: the
// previous predicate skipped only the literal ASCII space (U+0020) before deciding whether a
// value was quoted, so `Password=\t"secret"` (a tab, not a space, before the opening quote) —
// a form real Npgsql parses and extracts `secret` from — fell through to the unquoted branch
// instead, which captured the literal text `\t"secret"` (quotes included) as the "value".
// That never matches what the subprocess actually receives and echoes back, so the real
// secret reached rendered output unredacted.
//
// This is exactly Unicode's "White_Space" property, which is also the documented definition
// of .NET's `System.Char.IsWhiteSpace(char)` (categories SpaceSeparator/LineSeparator/
// ParagraphSeparator, plus the six control characters U+0009-U+000D and U+0085) — the
// predicate Npgsql's own connection-string tokenizer defers to. Verified directly against the
// repository's real Npgsql 10.0.0 assembly (`~/.nuget/packages/npgsql/10.0.0`) with a
// synthetic marker password, one accepted/rejected form at a time:
//   accepted before/after a quote: SPACE, TAB, LF, CR, CRLF, FF, VT, NBSP (U+00A0),
//     NEL (U+0085), OGHAM SPACE MARK (U+1680), EN QUAD (U+2000), HAIR SPACE (U+200A),
//     LINE SEPARATOR (U+2028), PARAGRAPH SEPARATOR (U+2029), NARROW NBSP (U+202F),
//     MEDIUM MATHEMATICAL SPACE (U+205F), IDEOGRAPHIC SPACE (U+3000)
//   rejected (throws FormatException, so no connection is ever attempted): ZERO WIDTH NO-BREAK
//     SPACE / BOM (U+FEFF) — deliberately excluded below even though some whitespace-ish JS
//     regexes (and V8's own `String.prototype.trim`) treat it as trimmable
// `\p{White_Space}` is the one built-in JS regex class whose membership matches this list
// exactly (unlike `\s`, which matches U+FEFF but not U+0085).
const CONNECTION_STRING_WHITESPACE = /\p{White_Space}/u;
// @ts-expect-error rung-0: add proper type in later rung
const isConnectionStringWhitespace = (char) =>
	char !== undefined && CONNECTION_STRING_WHITESPACE.test(char);

// Trims exactly the whitespace set above — not JS's native `.trim()`, which (via V8) also
// strips U+FEFF, a character real Npgsql refuses to treat as whitespace at all. Using the same
// predicate everywhere keeps "skip" and "trim" from silently disagreeing with each other.
// @ts-expect-error rung-0: add proper type in later rung
const trimConnectionStringWhitespace = (value) => {
	let start = 0;
	let end = value.length;
	while (start < end && isConnectionStringWhitespace(value[start])) {
		start += 1;
	}
	while (end > start && isConnectionStringWhitespace(value[end - 1])) {
		end -= 1;
	}

	return value.slice(start, end);
};

// Tokenizes an ADO.NET/Npgsql-style connection string into ordered [key, value] pairs,
// correctly handling double- and single-quoted values — which may themselves contain
// literal semicolons — and doubled-quote escaping inside them
// (https://www.npgsql.org/doc/connection-string-parameters.html). Round-3 review found the
// previous naive `;`-splitting regex truncated a valid `Password="pa;ss word"` at the first
// semicolon, so only `pa` was ever redacted and the rest of the password reached error
// output. This walks the string character-by-character instead of assuming values never
// contain the pair delimiter.
// @ts-expect-error rung-0: add proper type in later rung
export const parseConnectionStringPairs = (connectionString) => {
	const pairs = [];
	const text = connectionString ?? '';
	let index = 0;

	// @ts-expect-error rung-0: add proper type in later rung
	const skipWhile = (predicate) => {
		while (index < text.length && predicate(text[index])) {
			index += 1;
		}
	};

	while (index < text.length) {
		// @ts-expect-error rung-0: add proper type in later rung
		skipWhile((char) => isConnectionStringWhitespace(char) || char === ';');
		if (index >= text.length) {
			break;
		}

		const keyStart = index;
		while (index < text.length && text[index] !== '=' && text[index] !== ';') {
			index += 1;
		}

		const key = trimConnectionStringWhitespace(text.slice(keyStart, index));
		if (text[index] !== '=') {
			// Malformed segment (no '=' before the next ';' or end) — skip past it rather
			// than guess at a key/value split.
			index += 1;
			continue;
		}

		index += 1; // consume '='
		// @ts-expect-error rung-0: add proper type in later rung
		skipWhile((char) => isConnectionStringWhitespace(char));

		let value = '';
		const quote =
			text[index] === '"' || text[index] === "'" ? text[index] : null;

		if (quote) {
			index += 1; // consume the opening quote
			while (index < text.length) {
				if (text[index] === quote) {
					if (text[index + 1] === quote) {
						value += quote; // a doubled quote is an escaped literal quote char
						index += 2;
						continue;
					}

					index += 1; // consume the closing quote
					break;
				}

				value += text[index];
				index += 1;
			}

			// Discard anything between the closing quote and the next ';' — whitespace
			// only in a well-formed connection string.
			while (index < text.length && text[index] !== ';') {
				index += 1;
			}
		} else {
			const valueStart = index;
			while (index < text.length && text[index] !== ';') {
				index += 1;
			}

			value = trimConnectionStringWhitespace(text.slice(valueStart, index));
		}

		if (key.length > 0) {
			pairs.push([key, value]);
		}
	}

	return pairs;
};

// Full-string redaction alone misses the password appearing on its own (e.g. a child that
// echoes only the credential it failed to authenticate with, not the whole connection
// string) — round-2 review reproduced exactly that. Redacting the extracted password as its
// own secret closes that gap for both quoted and unquoted values (round-3).
// @ts-expect-error rung-0: add proper type in later rung
export const extractConnectionStringPassword = (connectionString) => {
	for (const [key, value] of parseConnectionStringPairs(connectionString)) {
		if (/^password$/i.test(key) && value.length > 0) {
			return value;
		}
	}

	return undefined;
};

// Npgsql connection strings can carry MORE than one credential-bearing parameter: the
// primary `Password`, and a separate `SSL Password` for a client certificate
// (https://www.npgsql.org/doc/connection-string-parameters.html). Round-4 review reproduced
// a child process echoing only the SSL Password value back on its own — redacting just the
// primary Password (as extractConnectionStringPassword alone did) left that credential to
// reach rendered command errors unredacted. This collects every secret-bearing key's value,
// in the order it appears, so every occurrence of every known credential parameter is caught.
//
// Round-5 review (BLOCKER-adjacent IMPORTANT): `Password` is not the only spelling Npgsql
// accepts for the same property. Verified directly against Npgsql 10.0.0's own tagged source
// (https://github.com/npgsql/npgsql/blob/v10.0.0/src/Npgsql/NpgsqlConnectionStringBuilder.cs):
//
//   [DisplayName("Password")]
//   [NpgsqlConnectionStringProperty("PSW", "PWD")]
//   public string? Password
//
//   [DisplayName("SSL Password")]
//   [NpgsqlConnectionStringProperty]
//   public string? SslPassword
//
// `Password` has exactly two accepted synonyms, `PSW` and `PWD` — no more, confirmed by
// grepping the whole file for every `NpgsqlConnectionStringProperty`/`DisplayName` attribute
// that mentions a password-shaped keyword. `SSL Password` carries no further synonym beyond
// its own (already-covered) collapsed/spaced spelling. `Passfile`, `SSL Key`, and
// `SSL Certificate` are also in that file but hold PATHS to credential material, not credential
// values themselves, so they are deliberately not in this list.
const SECRET_CONNECTION_STRING_KEY_PATTERNS = [
	/^password$/i,
	/^psw$/i,
	/^pwd$/i,
	/^ssl\s*password$/i,
];

// @ts-expect-error rung-0: add proper type in later rung
export const extractConnectionStringSecretValues = (connectionString) => {
	const values = [];
	for (const [key, value] of parseConnectionStringPairs(connectionString)) {
		if (
			value.length > 0 &&
			SECRET_CONNECTION_STRING_KEY_PATTERNS.some((pattern) => pattern.test(key))
		) {
			values.push(value);
		}
	}

	return values;
};

// The full set of values a connection string should never let leak into a rendered error:
// the string itself, and every secret-bearing parameter's value in isolation (at least
// Password and SSL Password — round-4 review).
// @ts-expect-error rung-0: add proper type in later rung
export const connectionStringSecrets = (connectionString) => {
	return [
		connectionString,
		...extractConnectionStringSecretValues(connectionString),
	].filter((value) => typeof value === 'string' && value.length > 0);
};

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

// @ts-expect-error rung-0: add proper type in later rung
export const parseArgs = (args) =>
	parseLauncherArgs(args, {
		defaultPort: DEFAULT_PORT,
		extraFlags: { '--allow-migrations': 'allowMigrations' },
	});

// ---------------------------------------------------------------------------
// Env-file helpers (small + pure, so the migration guard's plumbing is testable
// without touching a real filesystem).
// ---------------------------------------------------------------------------

// Extracts `KEY="value"` or `KEY=value` from a .env-style file's raw content.
// Returns undefined when the key is absent, commented out, or blank.
// @ts-expect-error rung-0: add proper type in later rung
export const extractEnvValue = (content, key) => {
	const pattern = new RegExp(`^${key}=(.*)$`, 'm');
	const match = pattern.exec(content);
	if (!match) {
		return undefined;
	}

	const raw = match[1].trim();
	const unquoted = raw.replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');
	if (unquoted.length > 0) {
		return unquoted;
	}
	return undefined;
};

// Resolves the TRUSTED_PROXY_CIDRS value a worktree's own .env.development carries,
// falling back to AppEnvironment's own default when the line is missing (#1016: fresh
// worktrees don't carry it at all). Never requires editing the worktree's env file.
// @ts-expect-error rung-0: add proper type in later rung
export const resolveTrustedProxyCidrs = (envFileContent) => {
	return (
		extractEnvValue(envFileContent, 'TRUSTED_PROXY_CIDRS') ??
		DEFAULT_TRUSTED_PROXY_CIDRS
	);
};

// @ts-expect-error rung-0: add proper type in later rung
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

// @ts-expect-error rung-0: add proper type in later rung
const createIndeterminateError = (message) => {
	const error = new Error(
		`${message} Refusing to start — an indeterminate migration state is not a safe one.`,
	);
	// @ts-expect-error rung-0: TS2339
	error.code = 'MIGRATION_GUARD_INDETERMINATE';
	return error;
};

// Fails closed on anything that isn't unambiguously "here is the full migration list and
// each one's applied state". dotnet-ef 10.0.2 can exit 0 with every entry's `applied` set
// to `null` when the database is unreachable (verified independently in review) — keeping
// only `applied === false` entries would silently treat that as "nothing pending" and let
// the API launch. A non-empty array of entries, each with a non-empty (non-whitespace),
// UNIQUE string `id` and a boolean `applied`, is the only shape trusted here; anything else
// throws MIGRATION_GUARD_INDETERMINATE instead of resolving to an empty pending list.
//
// Deliberately never interpolates the untrusted entry itself (no JSON.stringify(entry)) into
// the error — dotnet-ef's output is not something this guard should treat as safe to render
// verbatim (round-2 review: an invalid entry carrying a diagnostic field with the connection
// string reproduced the full string and password in a prior version of this function). Only
// the entry's position and which check it failed are reported.
// @ts-expect-error rung-0: add proper type in later rung
export const validateMigrationEntries = (parsed) => {
	if (!Array.isArray(parsed) || parsed.length === 0) {
		throw createIndeterminateError(
			`dotnet-ef reported ${Array.isArray(parsed) ? 'zero migrations' : 'a non-array result'}, but this branch always has at least one (Init).`,
		);
	}

	const seenIds = new Set();

	for (const [index, entry] of parsed.entries()) {
		const hasValidId =
			entry !== null &&
			typeof entry === 'object' &&
			typeof entry.id === 'string' &&
			entry.id.trim().length > 0;
		const hasValidApplied =
			entry !== null &&
			typeof entry === 'object' &&
			typeof entry.applied === 'boolean';

		if (!hasValidId) {
			throw createIndeterminateError(
				`dotnet-ef reported a migration entry at index ${String(index)} with a missing, ` +
					'non-string, or whitespace-only "id".',
			);
		}

		if (!hasValidApplied) {
			throw createIndeterminateError(
				`dotnet-ef reported a migration entry at index ${String(index)} (id: ${entry.id}) ` +
					'with a missing or non-boolean "applied".',
			);
		}

		if (seenIds.has(entry.id)) {
			throw createIndeterminateError(
				`dotnet-ef reported the migration id "${entry.id}" more than once — a migration ` +
					'list is only unambiguous when every id is unique.',
			);
		}

		seenIds.add(entry.id);
	}

	return parsed;
};

// @ts-expect-error rung-0: add proper type in later rung
export const extractPendingMigrationIds = (migrationEntries) => {
	return (
		migrationEntries
			// @ts-expect-error rung-0: add proper type in later rung
			.filter((entry) => entry.applied === false)
			// @ts-expect-error rung-0: add proper type in later rung
			.map((entry) => entry.id)
	);
};

// @ts-expect-error rung-0: add proper type in later rung
export const formatMigrationGuardError = (pendingMigrationIds) => {
	// @ts-expect-error rung-0: TS2339 - stays untyped until a later rung
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
// @ts-expect-error rung-0: add proper type in later rung
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
// the migration-guard proof itself must call this with the real runner.
export const listMigrationsJson = ({
	// @ts-expect-error rung-0: add proper type in later rung
	apiDir,
	// @ts-expect-error rung-0: add proper type in later rung
	connectionString,
	// @ts-expect-error rung-0: add proper type in later rung
	trustedProxyCidrs,
	run = runCommand,
}) => {
	const env = {
		APP_ROLE: 'api',
		TRUSTED_PROXY_CIDRS: trustedProxyCidrs,
		POSTGRES_CONNECTION_STRING: connectionString,
	};
	// Covers both credential sources: the connection string's own secret-bearing parameters,
	// and the separate ambient PGPASSWORD source (round-5 review) — either can reach a
	// rendered error from these subprocesses. The shared runCommand merges the ambient
	// source in again internally; declaring it here keeps the declared list self-contained.
	const secrets = [
		...connectionStringSecrets(connectionString),
		...ambientCredentialSecrets(),
	];

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
		// otherwise echo a connection failure preamble containing the connection string. Also
		// redact: modern V8 JSON.parse error messages can include a literal excerpt of the
		// offending input (round-2 review: unparseable stdout beginning with the password
		// reproduced it here even though the raw stdout itself is never rendered).
		const parserMessage = redactSecrets(
			String(
				// @ts-expect-error rung-0: TS2339 - `error` stays untyped until a later rung
				error?.message ?? error,
			),
			// @ts-expect-error rung-0: TS2345 - secrets stays untyped until a later rung
			secrets,
		);
		throw createIndeterminateError(
			`dotnet-ef output could not be parsed as JSON: ${parserMessage}.`,
		);
	}

	return validateMigrationEntries(parsed);
};

// Throws a MIGRATION_GUARD_BLOCKED error naming the pending migration(s) unless
// `allowMigrations` is set, in which case it warns and returns them instead.
export const assertNoPendingMigrations = ({
	// @ts-expect-error rung-0: add proper type in later rung
	apiDir,
	// @ts-expect-error rung-0: add proper type in later rung
	connectionString,
	// @ts-expect-error rung-0: add proper type in later rung
	trustedProxyCidrs,
	// @ts-expect-error rung-0: add proper type in later rung
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
		// @ts-expect-error rung-0: TS2339
		error.code = 'MIGRATION_GUARD_BLOCKED';
		// @ts-expect-error rung-0: TS2339
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
	// @ts-expect-error rung-0: add proper type in later rung
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

// The env a launched API child gets.
//
// forceApiRole: `main` now passes true UNCONDITIONALLY (round-2 review BLOCKER) — not only
// on the migration-bypass path. Losing `dev-api` job-engine parity is the correct trade: the
// whole premise of this command is that reviewing a branch must not disturb the shared dev
// database, and the All/Worker role starts JobQueueProcessor, JobQueueListener,
// SchedulerLeaderService, JobQueueMonitorService, WorkerHeartbeatService, and
// InvitationEmailOutboxDispatcher against that SAME shared database
// (apps/api/Infrastructure/Jobs/JobsServiceRegistration.cs) — a second job engine, one per
// concurrent review session, all claiming shared queued work, sending real email, and
// competing for scheduler leadership. That is exactly the disturbance #1016 exists to avoid,
// independent of whether a migration happens to be pending. The Api role registers none of
// it (apps/api/Program.cs). This only takes effect because of the #1019 NoClobber fix
// (apps/api/Lib/AppEnvironment.cs) — without it, .env.development's APP_ROLE="all" would
// silently overwrite this value back (verified empirically; see the commit history).
//
// connectionStringOverride: `main` now passes the SAME worktree-file-resolved value used to
// build the guard's environment, UNCONDITIONALLY (round-2 review BLOCKER). Without this,
// buildApiChildEnv started from the launcher's own ambient `process.env`, so with NoClobber
// in place an exported POSTGRES_CONNECTION_STRING in the reviewer's OWN shell would survive
// and win for the launched child — while the guard, which always builds its env explicitly
// from the worktree file, checked a different database entirely. Resolve the connection
// once in `main`, pin that exact value into both, and never silently honor an ambient
// connection string — the issue's decision was the shared development database,
// deliberately, not whatever the operator's shell happens to export.
export const buildApiChildEnv = ({
	// @ts-expect-error rung-0: TS2339
	trustedProxyCidrs,
	forceApiRole = false,
	// @ts-expect-error rung-0: TS2339
	connectionStringOverride,
} = {}) => {
	const env = { ...process.env, TRUSTED_PROXY_CIDRS: trustedProxyCidrs };
	if (forceApiRole) {
		// @ts-expect-error rung-0: TS2339
		env.APP_ROLE = 'api';
	}

	if (connectionStringOverride) {
		// @ts-expect-error rung-0: TS2339
		env.POSTGRES_CONNECTION_STRING = connectionStringOverride;
	}

	return env;
};

const isWindows = process.platform === 'win32';

// Spawns the API child without waiting on it — split out from launchApi so a test can
// assert readiness/liveness itself and control shutdown, rather than being stuck inside a
// promise that only resolves once the child has already exited.
//
// POSIX: `detached: true` makes `child.pid` the leader of a NEW process group, so
// `process.kill(-child.pid, signal)` reaches the whole tree in one call — `dotnet watch`
// itself, the `dotnet-watch.dll` process it spawns, and the actual PublyApp.Api process it
// spawns in turn. Signaling only `child.pid` (no leading `-`) reaches just the outermost
// `dotnet` dispatch process; `dotnet watch` is confirmed (by hand) to survive its inner app
// crashing — "Waiting for a file to change before restarting" — so that alone is not enough
// to guarantee the whole tree is gone.
//
// Windows: deliberately NOT detached. A negative pid is a POSIX process-group id; Node's own
// docs say `process.kill()` with one throws on Windows (round-3 review), and `detached: true`
// on Windows does not create anything analogous to a killable process group — it instead
// gives the child its own console window, which is not what we want here. Windows tree-kill
// instead addresses the process BY PID by walking its actual process tree: see
// killApiChildGroup's `taskkill /PID <pid> /T` branch.
// @ts-expect-error rung-0: add proper type in later rung
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
			detached: !isWindows,
		},
	);

	return { child, publicUrl };
};

// Signals the whole process tree spawned by spawnApiChild, not just the immediate child.
//
// POSIX: process.kill(-pid, signal) against the process group created by `detached: true`
// above — reaches dotnet watch and every process it spawned. Swallows ESRCH-style failures
// (group already gone).
//
// Windows: UNVERIFIED — written to Node's and Microsoft's documented behavior, but no
// Windows environment was available to run it (see the justfile `review-api` Windows recipe
// and the round-3 review that raised this). `taskkill /PID <pid> /T` walks the real process
// tree rooted at that PID regardless of process-group membership, which is why
// spawnApiChild does not need `detached: true` on this platform at all. `/T` alone requests
// a normal termination first (many console apps ignore it and taskkill reports a non-zero
// exit); `/F` forces it. SIGKILL (already an escalation, e.g. from killAndReapApiChild after
// a graceful attempt timed out) forces immediately; anything else tries graceful first and
// escalates to forced only if that attempt did not report success.
// @ts-expect-error rung-0: add proper type in later rung
const killApiChildGroup = (child, signal) => {
	if (child.killed || child.exitCode !== null) {
		return;
	}

	if (isWindows) {
		const pid = String(child.pid);
		const forceImmediately = signal === 'SIGKILL';
		const graceful = forceImmediately
			? null
			: spawnSync('taskkill', ['/PID', pid, '/T'], { stdio: 'ignore' });

		if (forceImmediately || !graceful || graceful.status !== 0) {
			spawnSync('taskkill', ['/PID', pid, '/T', '/F'], { stdio: 'ignore' });
		}

		return;
	}

	try {
		process.kill(-child.pid, signal);
	} catch {
		// Already gone, or never got its own process group — nothing left to signal.
	}
};

// Kills the child's whole process group and waits (bounded) for it to actually exit, so a
// caller that is about to report failure and exit does not leave `dotnet watch` (and its
// descendants) running on the requested port — the caller reported it as failed; it must
// not silently keep serving traffic.
// @ts-expect-error rung-0: add proper type in later rung
const killAndReapApiChild = async (child, { timeoutMs = 5000 } = {}) => {
	if (child.exitCode !== null) {
		return;
	}

	killApiChildGroup(child, 'SIGTERM');
	const exited = await Promise.race([
		once(child, 'exit').then(() => true),
		new Promise((resolve) => {
			setTimeout(() => resolve(false), timeoutMs);
		}),
	]);

	if (!exited && child.exitCode === null) {
		killApiChildGroup(child, 'SIGKILL');
	}
};

// @ts-expect-error rung-0: add proper type in later rung
const launchApi = async (worktreePath, port, options) => {
	const { child, publicUrl } = spawnApiChild(worktreePath, port, options);

	// This exact pid is the one Node's own spawn() call just set buildApiChildEnv's resolved
	// env on — not something a caller has to reconstruct or search for. Environment variables
	// are inherited unmodified down the whole spawn chain (dotnet watch -> dotnet-watch.dll ->
	// dotnet run -> the actual app process), so this single, known-correct pid's own
	// /proc/<pid>/environ is already ground truth for what the whole launched tree is running
	// with — reporting it is strictly more reliable than any pattern a reader could use to
	// rediscover it later.
	console.log(`${LAUNCHED_API_CHILD_PID_PREFIX} ${String(child.pid)}`);

	forwardTerminationSignals(
		// @ts-expect-error rung-0: TS7006 - signal stays untyped until a later rung
		(signal) => killApiChildGroup(child, signal),
	);

	// A longer-than-default budget (~30s): the API is already built by this point (the
	// migration guard just did it), but a loaded or cold machine can still take a while to
	// bind. See waitForApiReachable's own default for the tighter budget appropriate to a
	// test that already knows which outcome to expect.
	const reachable = await waitForApiReachable(`${publicUrl}${HEALTH_PATH}`, {
		attempts: 120,
		intervalMs: 250,
	});
	if (!reachable) {
		// Report failure, but do not leave dotnet watch (and its descendants) running on the
		// requested port after telling the operator this launch failed.
		await killAndReapApiChild(child);
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

const REQUESTED_ARGS = process.argv.slice(2);

const main = async () => {
	// @ts-expect-error rung-0: TS2339 - allowMigrations comes from the open-ended flags result
	const { requestedRef, port, allowMigrations } = parseArgs(REQUESTED_ARGS);
	const resolved = await resolveReviewTarget({ requestedRef });
	const worktree = requireResolvedWorktree(resolved, requestedRef);

	await ensurePortOpen(port, {
		// @ts-expect-error rung-0: TS2353 - `what` is open-ended until a later rung types it
		what: 'API',
	});
	ensureEnvCopy(worktree.path, ENV_FILE);

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
	// Both forceApiRole and connectionStringOverride are unconditional, not just on the
	// migration-bypass path — see the review-api-blockers comment on buildApiChildEnv.
	const { code, signal } = await launchApi(worktree.path, port, {
		trustedProxyCidrs,
		forceApiRole: true,
		connectionStringOverride: connectionString,
	});
	const afterDirty = trackedChanges(worktree.path);
	reportNewlyDirtyFiles(beforeDirty, afterDirty);

	if (signal) {
		process.exit(0);
	}

	if (code !== 0) {
		err(`API exited with code ${String(code)}.`);
	}
};

await runLauncherCli(main, fileURLToPath(import.meta.url), {
	MIGRATION_GUARD_BLOCKED:
		// @ts-expect-error rung-0: TS18046
		(error) => error.message,
	MIGRATION_GUARD_INDETERMINATE:
		// @ts-expect-error rung-0: TS18046
		(error) => error.message,
});
