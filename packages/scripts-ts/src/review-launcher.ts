#!/usr/bin/env node

// Application-neutral launcher infrastructure shared by review-front.ts and
// review-api.ts (#1020). Everything here must stay free of front/API product
// decisions: command execution with secret-aware rendering, optional GitHub
// execution, worktree discovery and root resolution, port probing, env-file
// copying with hardlink refusal, tracked-file checks, interactive selection,
// resolution error handling, child signal handling, and startup/exit plumbing.
// App-specific parts (prerequisites, launch commands, readiness budgets,
// user-facing banners) stay in the entrypoints.

import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:net';
import path from 'node:path';
import process from 'node:process';
import { createInterface } from 'node:readline';

import { parseWorktrees, parseTrackedChangesFromStatus } from './review-worktree.resolve.ts';

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

// @ts-expect-error rung-0: add proper type in later rung
export const err = (message) => {
	console.error(message);
	process.exit(1);
};

// ---------------------------------------------------------------------------
// Secret-aware rendering
// ---------------------------------------------------------------------------

export const REDACTED = '[REDACTED]';

// Replaces every occurrence of each non-empty value in `secrets` with a fixed marker.
// Used to keep a connection string's password out of any rendered command error —
// whether the secret leaked into argv, stdout, or stderr.
// @ts-expect-error rung-0: add proper type in later rung
export const redactSecrets = (text, secrets = []) => {
	let redacted = text;
	for (const secret of secrets) {
		// @ts-expect-error rung-0: TS2339
		if (typeof secret === 'string' && secret.length > 0) {
			redacted = redacted.split(secret).join(REDACTED);
		}
	}

	return redacted;
};

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

// Round-5 review IMPORTANT: the connection string is not the only credential source a
// launched subprocess can echo back. libpq/Npgsql also honor the standalone `PGPASSWORD`
// environment variable as a password
// (https://www.npgsql.org/doc/connection-string-parameters.html), and `runCommand` below
// inherits the ambient `process.env` for every subprocess it spawns. If the operator's own
// shell happens to export `PGPASSWORD`, that value is a real credential regardless of what
// the connection string itself contains, and must be redacted the same way. Read fresh (not
// cached) so a test can set/unset it around a single assertion.
//
// Living in the SHARED layer (#1020) is what makes the frontend launcher inherit credential
// redaction: neither launcher has to remember to pass secrets — every rendered command
// failure goes through collectEffectiveSecrets below, which merges the caller-declared
// secrets with these ambient credentials.
export const ambientCredentialSecrets = () => {
	return [process.env.PGPASSWORD].filter(
		(value) => typeof value === 'string' && value.length > 0,
	);
};

// Every secret a rendered command error must respect: the caller-declared list plus the
// ambient credentials, deduplicated. Declared last-wins ordering does not matter —
// redactSecrets replaces occurrences independently.
// @ts-expect-error rung-0: add proper type in later rung
export const collectEffectiveSecrets = (secrets = []) => {
	return [...new Set([...secrets, ...ambientCredentialSecrets()])];
};

// ---------------------------------------------------------------------------
// Command execution
// ---------------------------------------------------------------------------

// Bounded so a stuck command cannot hang the launcher forever. Builds get a longer ceiling
// (cold-cache dotnet build can genuinely take a few minutes — see BUILD_COMMAND_TIMEOUT_MS
// in review-api.ts) and long installs their own explicit budget; everything else (git, gh,
// dotnet-ef list) is expected to be fast.
export const DEFAULT_COMMAND_TIMEOUT_MS = 60_000;

// Exported so the bounded-timeout behavior can be tested directly against a real
// subprocess, not a mock of spawnSync's option-handling.
// @ts-expect-error rung-0: add proper type in later rung
export const runCommand = (command, args, options = {}) => {
	// @ts-expect-error rung-0: TS2339
	const secrets = collectEffectiveSecrets(options.secrets);
	const result = spawnSync(command, args, {
		// @ts-expect-error rung-0: TS2339
		cwd: options.cwd,
		// @ts-expect-error rung-0: TS2339
		env: { ...process.env, ...options.env },
		encoding: 'utf8',
		// @ts-expect-error rung-0: TS2339
		stdio: options.stdio ?? 'pipe',
		// @ts-expect-error rung-0: TS2339
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
		// @ts-expect-error rung-0: TS2339
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

// @ts-expect-error rung-0: add proper type in later rung
export const runCommandOptional = (command, args, options = {}) => {
	try {
		return runCommand(command, args, options);
	} catch (error) {
		return {
			status: -1,
			stdout: '',
			// @ts-expect-error rung-0: TS2339
			stderr: String(error?.message ?? ''),
			error,
		};
	}
};
