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

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const rootRepoCache = { path: null };
const requestedArgs = process.argv.slice(2);
const hasInteractiveTerminal = process.stdin.isTTY && process.stdout.isTTY;

const err = (message) => {
	console.error(message);
	process.exit(1);
};

const runCommand = (command, args, options = {}) => {
	const result = spawnSync(command, args, {
		cwd: options.cwd,
		env: { ...process.env, ...(options.env ?? {}) },
		encoding: 'utf8',
		stdio: options.stdio ?? 'pipe',
	});

	if (result.error) {
		throw result.error;
	}

	const status = result.status ?? -1;
	if (status !== 0) {
		const stderr = String(result.stderr ?? '').trim();
		const stdout = String(result.stdout ?? '').trim();
		const prefix = options.label ? `${options.label}: ` : '';
		const detail = stderr || stdout ? `\n${stderr || stdout}` : '';
		throw new Error(
			`${prefix}${command} ${args.join(' ')} exited with status ${String(status)} ${detail}`,
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
// not applied. `dotnet ef migrations list --json --connection <conn>` reports each
// migration compiled into the branch alongside whether it is applied to whatever
// database <conn> points at — passing --connection explicitly means this check does
// not depend on the app's own AppEnvironment/APP_ROLE/production classification at
// all, only on the connection string itself.
// ---------------------------------------------------------------------------

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

// Builds once (doc-gen disabled — see #1006/AGENTS.md) then asks dotnet-ef for the
// migration list + applied state against the given connection string. Exported with
// an injectable `runCommand` so unit tests can stub it; the migration-guard proof
// itself must call this with the real runner (see
// scripts/review-api.migration-guard.integration.test.mjs).
export const listMigrationsJson = ({
	apiDir,
	connectionString,
	trustedProxyCidrs,
	run = runCommand,
}) => {
	const env = { APP_ROLE: 'api', TRUSTED_PROXY_CIDRS: trustedProxyCidrs };

	run('dotnet', ['build', '-property:OpenApiGenerateDocuments=false'], {
		cwd: apiDir,
		env,
		label: 'dotnet build',
	});

	const result = run(
		'dotnet',
		[
			'tool',
			'run',
			'dotnet-ef',
			'migrations',
			'list',
			'--no-build',
			'--json',
			'--connection',
			connectionString,
		],
		{ cwd: apiDir, env, label: 'dotnet-ef migrations list' },
	);

	return JSON.parse(result.stdout);
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

const waitForApiReachable = async (url) => {
	for (let attempt = 0; attempt < 60; attempt += 1) {
		try {
			await fetch(url, { signal: AbortSignal.timeout(1000) });
			return;
		} catch {
			await new Promise((resolve) => {
				setTimeout(resolve, 250);
			});
		}
	}

	err(`API did not become reachable at ${url} before timeout.`);
};

const launchApi = async (worktreePath, port, trustedProxyCidrs) => {
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
			env: { ...process.env, TRUSTED_PROXY_CIDRS: trustedProxyCidrs },
		},
	);

	const shutdown = (signal) => {
		if (!child.killed) {
			child.kill(signal);
		}
	};
	process.on('SIGINT', () => shutdown('SIGINT'));
	process.on('SIGTERM', () => shutdown('SIGTERM'));

	await waitForApiReachable(`${publicUrl}${HEALTH_PATH}`);
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
	assertNoPendingMigrations({
		apiDir,
		connectionString,
		trustedProxyCidrs,
		allowMigrations,
	});
	console.log('Migration guard: nothing pending.');

	console.log('\n');
	console.log('Launching PR API review server');
	console.log(`worktree: ${worktree.path}`);
	console.log(`open:     http://localhost:${String(port)}${HEALTH_PATH}`);
	console.log(
		`Tip: keep a second terminal for the frontend (just review-front) while both sessions run.`,
	);
	console.log('');

	const beforeDirty = trackedChanges(worktree.path);
	const { code, signal } = await launchApi(
		worktree.path,
		port,
		trustedProxyCidrs,
	);
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

			case 'MIGRATION_GUARD_BLOCKED': {
				err(error.message);
				break;
			}

			default: {
				err(error?.message ?? String(error));
			}
		}
	}
}
