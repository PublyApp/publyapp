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
import { fileURLToPath } from 'node:url';

import {
	GH_AUTH_FAILURE,
	GH_INVOCATION_FAILURE,
	GH_NETWORK_FAILURE,
	getBranchPathByMap,
	parseWorktrees,
	parseTrackedChangesFromStatus,
	resolveTarget,
	runIssueByNumber,
	runPrByNumber,
} from './review-worktree.resolve.ts';

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

// The connection string is not the only credential source a launched subprocess can echo
// back. libpq/Npgsql also honor the standalone `PGPASSWORD` environment variable as a
// password (https://www.npgsql.org/doc/connection-string-parameters.html), and `runCommand`
// inherits the ambient `process.env` for every subprocess it spawns. If the operator's own
// shell happens to export `PGPASSWORD`, that value is a real credential regardless of what
// any connection string contains, and must be redacted the same way. Read fresh (not cached)
// so a test can set/unset it around a single assertion.
//
// Living in the SHARED layer (#1020) is what makes the frontend launcher inherit credential
// redaction: every launcher's rendered command failure goes through collectEffectiveSecrets,
// which merges the caller-declared secrets with these ambient credentials — no entrypoint has
// to remember.
export const ambientCredentialSecrets = () => {
	const password = process.env.PGPASSWORD;
	if (typeof password === 'string' && password.length > 0) {
		return [password];
	}
	return [];
};

// Every secret a rendered command error must respect: the caller-declared list plus the
// ambient credentials, deduplicated. Ordering does not matter — redactSecrets replaces
// occurrences independently.
export const collectEffectiveSecrets = (
	// @ts-expect-error rung-0: add proper type in later rung
	secrets,
) => {
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
	const secrets = collectEffectiveSecrets(options.secrets ?? []);
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
			// @ts-expect-error rung-0: TS2345 - secrets stays untyped until a later rung
			result.error.message = redactSecrets(result.error.message, secrets);
		}

		throw result.error;
	}

	// spawnSync sets status to null (not just absent) both on a normal signal-kill and on
	// a timeout; treating that as a non-zero exit means a timed-out command fails closed
	// through the exact same throw path as any other command failure.
	const status = result.status ?? -1;
	if (status !== 0) {
		// @ts-expect-error rung-0: TS2345 - secrets stays untyped until a later rung
		const stderr = redactSecrets(String(result.stderr ?? '').trim(), secrets);
		// @ts-expect-error rung-0: TS2345 - secrets stays untyped until a later rung
		const stdout = redactSecrets(String(result.stdout ?? '').trim(), secrets);
		// @ts-expect-error rung-0: TS2339
		const prefix = options.label ? `${options.label}: ` : '';
		const detail = stderr || stdout ? `\n${stderr || stdout}` : '';
		// @ts-expect-error rung-0: TS2345 - secrets stays untyped until a later rung
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

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

// Whole-string decimal check — `Number.parseInt` stops at the first non-digit character and
// happily returns 5000 for "5000junk" or "5000.5" (round-3 review), silently accepting
// garbage input as a valid port.
// @ts-expect-error rung-0: add proper type in later rung
export const parseStrictPort = (rawValue) => {
	if (!/^\d+$/.test(rawValue)) {
		err(`Invalid --port value: ${rawValue}.`);
	}

	const parsed = Number.parseInt(rawValue, 10);
	if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65_535) {
		err(`Invalid --port value: ${rawValue}.`);
	}

	return parsed;
};

/**
 * Parses launcher argv: `[ref] [--port <n>|--port=<n>] [--flag]`.
 *
 * The single shared implementation of the two launchers' argument grammar
 * (#1020 reconciliation: argument parsing was previously exported and unit-tested in one
 * copy only). `extraFlags` maps additional boolean flag names (`--allow-migrations`) to
 * their camelCase result key (`allowMigrations`) with their default value; unknown
 * `--`-prefixed options are rejected immediately regardless of whether a ref has been
 * assigned yet — round-3 review found a leading unknown option was silently accepted as the
 * requested ref.
 */
export const parseLauncherArgs = (
	// @ts-expect-error rung-0: add proper type in later rung
	args,
	// @ts-expect-error rung-0: TS7031
	{ defaultPort, extraFlags = {} },
) => {
	let requestedRef = '';
	let port = defaultPort;
	const flagNames = new Map(
		Object.entries(extraFlags).map(([flagName, resultKey]) => [
			flagName,
			{ resultKey, value: false },
		]),
	);

	for (let index = 0; index < args.length; index += 1) {
		const argument = args[index];
		if (argument === '--port') {
			const requestedPort = args[index + 1];
			if (!requestedPort) {
				err('Missing value for --port.');
			}

			index += 1;
			port = parseStrictPort(requestedPort);
			continue;
		}

		if (argument.startsWith('--port=')) {
			port = parseStrictPort(argument.slice('--port='.length));
			continue;
		}

		const flag = flagNames.get(argument);
		if (flag) {
			flag.value = true;
			continue;
		}

		// Reject any unrecognized `--`-prefixed option immediately, regardless of whether a
		// ref has been assigned yet — round-3 review found a leading unknown option (e.g.
		// `--bogus`) was silently accepted as the requested ref instead.
		if (argument.startsWith('--')) {
			err(`Unknown option: ${argument}`);
		}

		if (requestedRef.length > 0) {
			err(`Unexpected extra argument: ${argument}.`);
		}

		requestedRef = argument;
	}

	const result = { requestedRef, port };
	for (const { resultKey, value } of flagNames.values()) {
		// @ts-expect-error rung-0: TS2538 - result keys are open-ended until a later rung types them
		result[resultKey] = value;
	}

	return result;
};

// ---------------------------------------------------------------------------
// Worktree discovery and root resolution
// ---------------------------------------------------------------------------

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '../../..');
const rootRepoCache = { path: null };

export const getRepoRoot = () => repoRoot;

export const getThisFilePath = () => fileURLToPath(import.meta.url);

export const getWorktrees = () => {
	const output = runCommand('git', ['worktree', 'list', '--porcelain'], {
		cwd: repoRoot,
	}).stdout;

	return parseWorktrees(output);
};

export const getRootClonePath = () => {
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
		// @ts-expect-error rung-0: TS2322
		rootRepoCache.path = repoRoot;
		return rootRepoCache.path;
	}

	const commonDir = path.resolve(gitCommonDir);
	// @ts-expect-error rung-0: TS2322
	rootRepoCache.path = path.resolve(commonDir, '..');
	return rootRepoCache.path;
};

// ---------------------------------------------------------------------------
// Optional GitHub execution
// ---------------------------------------------------------------------------

/** Builds the `gh` runner the resolver expects: optional by design — a gh failure
 * degrades to an error result the resolver classifies, it never kills the process here. */
export const makeRunGh = () => {
	// @ts-expect-error rung-0: add proper type in later rung
	return async (args) =>
		runCommandOptional('gh', args, {
			cwd: repoRoot,
			label: 'gh',
		});
};

// ---------------------------------------------------------------------------
// Port probing
// ---------------------------------------------------------------------------

// @ts-expect-error rung-0: add proper type in later rung
export const isPortAvailableOnHost = async (host, port) => {
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

/** Exits when `port` is already taken on `host` — with a shared message whose subject
 * (`what`) differs per launcher ("frontend" vs "API"). */
export const ensurePortOpen = async (
	// @ts-expect-error rung-0: add proper type in later rung
	port,
	{
		host = '127.0.0.1',
		// @ts-expect-error rung-0: TS2339
		what,
	} = {},
) => {
	const available = await isPortAvailableOnHost(host, port);
	if (!available) {
		err(
			`Port ${String(
				port,
			)} is already in use. The root clone's ${what ?? 'app'} or another review launcher is likely running.\n` +
				'Stop that process, or run with --port <n> to force a different port.',
		);
	}
};

// ---------------------------------------------------------------------------
// Env-file copying + hardlink checks
// ---------------------------------------------------------------------------

// @ts-expect-error rung-0: add proper type in later rung
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

/** Copies `<root clone>/<envFile>` into the worktree unless a standalone copy already
 * exists there; refuses to touch a hardlinked file that would rewrite the root clone's. */
export const ensureEnvCopy = (
	// @ts-expect-error rung-0: add proper type in later rung
	worktreePath,
	envFile = '.env.development',
) => {
	// @ts-expect-error rung-0: TS2345
	const source = path.join(getRootClonePath(), envFile);
	const target = path.join(worktreePath, envFile);

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

// ---------------------------------------------------------------------------
// Tracked-file checks
// ---------------------------------------------------------------------------

export const trackedChanges = (
	// @ts-expect-error rung-0: add proper type in later rung
	worktreePath,
) => {
	const output = runCommand(
		'git',
		['-C', worktreePath, 'status', '--short', '--untracked-files=no'],
		{
			stdio: 'pipe',
		},
	).stdout;

	return parseTrackedChangesFromStatus(output);
};

/** Reports tracked files that became dirty during the session (after minus before). */
// @ts-expect-error rung-0: add proper type in later rung
export const reportNewlyDirtyFiles = (beforeDirty, afterDirty) => {
	const newlyDirty = [...afterDirty].filter((entry) => !beforeDirty.has(entry));
	if (newlyDirty.length > 0) {
		console.error('Warning: tracked files became dirty while the session ran.');
		for (const entry of newlyDirty) {
			console.error(`  ${entry}`);
		}
	}

	return newlyDirty;
};

// ---------------------------------------------------------------------------
// Interactive selection
// ---------------------------------------------------------------------------

const hasInteractiveTerminal = process.stdin.isTTY && process.stdout.isTTY;

export const getHasInteractiveTerminal = () => hasInteractiveTerminal;

// @ts-expect-error rung-0: add proper type in later rung
export const askChoice = async (title, rows) => {
	console.log(title);
	// @ts-expect-error rung-0: add proper type in later rung
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

	// @ts-expect-error rung-0: TS2345
	const index = Number.parseInt(selected, 10);
	if (!Number.isInteger(index) || index < 1 || index > rows.length) {
		err(`Invalid selection: ${selected}`);
	}

	return index - 1;
};

// ---------------------------------------------------------------------------
// Resolution error handling
// ---------------------------------------------------------------------------

/** Turns a resolveTarget() outcome into either a worktree or a precise exit error —
 * the exact not-found / issue-ambiguous / pr-unmatched handling both launchers repeat. */
export const requireResolvedWorktree = (
	// @ts-expect-error rung-0: add proper type in later rung
	resolved,
	// @ts-expect-error rung-0: add proper type in later rung
	requestedRef,
) => {
	const worktree = resolved?.worktree;
	if (worktree?.path) {
		return worktree;
	}

	if (resolved?.kind === 'not-found') {
		err(
			`No PR or issue found for ${String(
				resolved.requested,
			)}. Add this PR to a local worktree first.`,
		);
	}

	if (resolved?.kind === 'issue-ambiguous') {
		// @ts-expect-error rung-0: add proper type in later rung
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
};

/** Shared resolveTarget wiring: gh-backed runners plus this module's interactive picker. */
export const resolveReviewTarget = async ({
	// @ts-expect-error rung-0: TS2339
	requestedRef,
	// @ts-expect-error rung-0: TS2339
	preferCwdPath,
} = {}) => {
	const worktrees = getWorktrees();
	const byBranch = getBranchPathByMap(worktrees);
	const runGh = makeRunGh();

	return await resolveTarget(worktrees, byBranch, {
		requestedRef,
		hasInteractiveTerminal,
		askChoice,
		preferCwdPath,
		// @ts-expect-error rung-0: add proper type in later rung
		runPrByNumber: (number) => runPrByNumber(number, { runGh }),
		// @ts-expect-error rung-0: add proper type in later rung
		runIssueByNumber: (number) => runIssueByNumber(number, { runGh }),
		runGh,
	});
};

// ---------------------------------------------------------------------------
// Child signal handling
// ---------------------------------------------------------------------------

/** Forwards SIGINT/SIGTERM on this process to `onSignal`, once each. Both launchers
 * register exactly these two handlers around their child. */
// @ts-expect-error rung-0: add proper type in later rung
export const forwardTerminationSignals = (onSignal) => {
	process.on('SIGINT', () => onSignal('SIGINT'));
	process.on('SIGTERM', () => onSignal('SIGTERM'));
};

// ---------------------------------------------------------------------------
// Startup / exit plumbing
// ---------------------------------------------------------------------------

// The gh failure codes are re-exported from review-worktree.resolve.ts so entrypoints can
// keep importing everything launcher-related from this one module.

// @ts-expect-error rung-0: add proper type in later rung
const exitWithError = (error) => {
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

		default: {
			err(error?.message ?? String(error));
		}
	}
};

/** Runs `main()` only when this module IS the direct entrypoint (`entryFilePath`) and
 * maps known failure codes onto exits. `extraErrorCases` lets review-api.ts extend the
 * switch with its migration-guard codes without forking this plumbing. */
export const runLauncherCli = async (
	// @ts-expect-error rung-0: add proper type in later rung
	main,
	// @ts-expect-error rung-0: add proper type in later rung
	entryFilePath,
	extraErrorCases = {},
) => {
	if (process.argv[1] !== entryFilePath) {
		return;
	}

	try {
		await main();
	} catch (error) {
		// @ts-expect-error rung-0: TS2339/TS2538 - error is unknown, the cases map is open-ended
		const handled = extraErrorCases[error?.code];
		if (handled) {
			err(handled(error));
			return;
		}

		exitWithError(error);
	}
};
