#!/usr/bin/env node

import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { renameSync, writeFileSync } from 'node:fs';
import { existsSync } from 'node:fs';
import { createServer } from 'node:net';
import path from 'node:path';
import process from 'node:process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

const RESERVED_PORTS = new Set([5000, 5050, 5454]);
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const requestedRef = process.argv.at(2)?.trim() ?? '';
const hasInteractiveTerminal = process.stdin.isTTY && process.stdout.isTTY;

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

	if (result.status !== 0) {
		const stderr = String(result.stderr ?? '').trim();
		const prefix = options.label ? `${options.label}: ` : '';
		throw new Error(
			`${prefix}${command} ${args.join(' ')} exited with status ${String(result.status)} ${
				stderr ? `\n${stderr}` : ''
			}`,
		);
	}

	return {
		stdout: String(result.stdout ?? ''),
		stderr: String(result.stderr ?? ''),
		status: result.status,
	};
};

const runJson = (command, args, options = {}) => {
	const output = runCommand(command, args, options).stdout.trim();
	if (output.length === 0) {
		return null;
	}

	return JSON.parse(output);
};

const runJsonOptional = (command, args, options = {}) => {
	try {
		return runJson(command, args, options);
	} catch (error) {
		return null;
	}
};

const askChoice = async (title, rows) => {
	console.log(title);
	rows.forEach((row, index) => {
		console.log(`${index + 1}. ${row}`);
	});

	if (!hasInteractiveTerminal) {
		throw new Error(
			'Interactive selection required but terminal is not interactive.',
		);
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

const err = (message) => {
	console.error(message);
	process.exit(1);
};

const parseWorktrees = (raw) => {
	const entries = [];
	let current = null;

	for (const rawLine of raw.split('\n')) {
		const line = rawLine.trim();
		if (line.length === 0) {
			continue;
		}

		if (line.startsWith('worktree ')) {
			if (current) {
				entries.push(current);
			}
			current = {
				path: line.replace(/^worktree /, ''),
				head: '',
				branch: null,
			};
			continue;
		}

		if (line.startsWith('HEAD ') && current) {
			current.head = line.replace(/^HEAD /, '');
			continue;
		}

		if (line.startsWith('branch ') && current) {
			current.branch = line
				.replace(/^branch /, '')
				.replace(/^refs\/heads\//, '');
		}
	}

	if (current) {
		entries.push(current);
	}

	return entries;
};

const getWorktrees = () => {
	const output = runCommand('git', ['worktree', 'list', '--porcelain'], {
		cwd: repoRoot,
	}).stdout;

	return parseWorktrees(output);
};

const findPortAvailable = async (port) => {
	const tryBind = (host) =>
		new Promise((resolve) => {
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

	const v4 = await tryBind('127.0.0.1');
	if (!v4) {
		return false;
	}

	const v6 = await tryBind('::1');
	return v6;
};

const choosePort = async (prNumber) => {
	let candidate = 5000 + (prNumber % 1000);
	if (RESERVED_PORTS.has(candidate)) {
		candidate += 1;
	}

	for (let port = candidate; port <= 65535; port += 1) {
		if (RESERVED_PORTS.has(port)) {
			continue;
		}

		if (await findPortAvailable(port)) {
			return port;
		}
	}

	err('No free port found for PR frontend launch.');
};

const getBranchPathByMap = (worktrees) => {
	const map = new Map();
	for (const worktree of worktrees) {
		if (worktree.branch) {
			map.set(worktree.branch, worktree.path);
		}
	}
	return map;
};

const hasLocalBranch = (branchName) => {
	const result = spawnSync(
		'git',
		['show-ref', '--heads', '--verify', `refs/heads/${branchName}`],
		{
			cwd: repoRoot,
			encoding: 'utf8',
			stdio: 'ignore',
		},
	);
	return result.status === 0;
};

const resolveByPull = (pr, worktrees) => {
	const exact = worktrees.find(
		(worktree) => worktree.branch === pr.headRefName,
	);
	if (exact) {
		return exact;
	}

	const byHead = worktrees.find((worktree) => worktree.head === pr.headRefOid);
	if (byHead) {
		return byHead;
	}

	return null;
};

const resolveByNumber = async (number, worktrees) => {
	const pr = runJsonOptional('gh', [
		'pr',
		'view',
		String(number),
		'--json',
		'number,title,headRefName,headRefOid',
	]);
	if (pr) {
		const resolved = resolveByPull(pr, worktrees);
		if (resolved) {
			return { kind: 'pr', source: pr, worktree: resolved };
		}

		if (hasLocalBranch(pr.headRefName)) {
			err(
				`PR #${number} branch ${pr.headRefName} exists locally but has no worktree.`,
			);
		}

		const suggested = path.join(repoRoot, '.worktrees', `pr${number}`);
		console.error(`Could not resolve PR #${number} by branch or head SHA.`);
		console.error('Run this to add it:');
		console.error(
			`git worktree add ${JSON.stringify(suggested)} ${pr.headRefName}`,
		);
		process.exit(1);
	}

	const issue = runJsonOptional('gh', [
		'issue',
		'view',
		String(number),
		'--json',
		'title,number',
	]);
	if (!issue) {
		err(`No PR or issue found for ${number}.`);
	}

	const tokenPattern = new RegExp(`(^|[/_-])${number}([/_-]|$)`);
	const matches = worktrees.filter((worktree) =>
		worktree.branch ? tokenPattern.test(worktree.branch) : false,
	);
	if (matches.length === 0) {
		err(`No worktree branch matched issue pattern for #${number}.`);
	}
	if (matches.length > 1) {
		if (!hasInteractiveTerminal) {
			err(
				`Issue ${number} matched multiple branches, but terminal is not interactive.`,
			);
		}
		const rows = matches.map(
			(worktree) =>
				`${worktree.branch} | ${worktree.path} | head ${worktree.head}`,
		);
		const selected = await askChoice(
			`Multiple worktrees matched issue #${number}. Select one:`,
			rows,
		);
		return { kind: 'issue', worktree: matches[selected], source: issue };
	}

	return { kind: 'issue', worktree: matches[0], source: issue };
};

const resolveInteractivePicker = async (worktrees, byBranch) => {
	const prs = runJson('gh', [
		'pr',
		'list',
		'--state',
		'open',
		'--json',
		'number,title,headRefName',
	]);

	if (!Array.isArray(prs) || prs.length === 0) {
		err('No open PRs found for picker.');
	}

	const rows = prs.map((pr) => {
		const hasPath = byBranch.has(pr.headRefName);
		const originHost = `pr${pr.number}.localhost`;
		const derivedPort = 5000 + (pr.number % 1000);
		const resolvedPort = RESERVED_PORTS.has(derivedPort)
			? derivedPort + 1
			: derivedPort;
		return {
			number: pr.number,
			title: pr.title,
			branch: pr.headRefName,
			path: byBranch.get(pr.headRefName) ?? 'none',
			origin: `http://${originHost}:${resolvedPort}`,
			hasPath,
		};
	});

	rows.sort((left, right) => {
		if (left.hasPath === right.hasPath) {
			return left.number - right.number;
		}
		return left.hasPath ? -1 : 1;
	});

	const lines = rows.map(
		(row) =>
			`#${row.number} | ${row.branch} | ${row.path} | ${row.origin} | ${row.title}`,
	);
	const selected = await askChoice(
		'Choose PR to review (open PRs with worktrees first):',
		lines,
	);

	const row = rows[selected];
	return resolveByNumber(row.number, worktrees);
};

const resolveTarget = async (worktrees, byBranch) => {
	if (!requestedRef) {
		if (!hasInteractiveTerminal) {
			err('No PR/issue ref provided in a non-interactive terminal.');
		}

		return resolveInteractivePicker(worktrees, byBranch);
	}

	if (!/^\d+$/.test(requestedRef)) {
		err(`Expected a PR or issue number, got ${requestedRef}.`);
	}

	const number = Number.parseInt(requestedRef, 10);
	return resolveByNumber(number, worktrees);
};

const ensureApi = async () => {
	for (let attempt = 0; attempt < 6; attempt += 1) {
		try {
			const response = await fetch('http://127.0.0.1:5000/health', {
				signal: AbortSignal.timeout(1000),
			});

			if (response.ok) {
				return;
			}
		} catch {
			// Keep retrying while API comes up.
		}

		await new Promise((resolve) => {
			setTimeout(resolve, 1000);
		});
	}

	err('API on :5000 is not answering. Start it with:');
	console.error('  just dev-db');
	console.error('  just dev-api');
	process.exit(1);
};

const generateEnv = (worktreePath, prNumber, port) => {
	const frontendUrl = `http://pr${prNumber}.localhost:${port}`;
	const allowedToken = process.env.PUBLIC_POSTHOG_PROJECT_TOKEN?.trim()
		? process.env.PUBLIC_POSTHOG_PROJECT_TOKEN.trim()
		: (process.env.POSTHOG_PROJECT_TOKEN?.trim() ?? '');
	const lines = [
		'# Generated by review-front-2 — do not edit',
		`FRONT_URL=${frontendUrl}`,
		'PUBLIC_API_BASE_URL=http://localhost:5000',
		'SERVER_API_BASE_URL=http://localhost:5000',
		'VITE_ASP_SERVER_URL=http://localhost:5000',
	];
	if (allowedToken.length > 0) {
		lines.push(`PUBLIC_POSTHOG_PROJECT_TOKEN=${allowedToken}`);
	}

	const target = path.join(worktreePath, '.env.development.local');
	const temp = `${target}.${Date.now()}.tmp`;
	writeFileSync(temp, `${lines.join('\n')}\n`, 'utf8');
	renameSync(temp, target);
};

const ensureDependencies = (worktreePath) => {
	console.log('Checking pinned deps in worktree...');
	runCommand('node', ['apps/front-2/scripts/assert-pinned.mjs'], {
		cwd: worktreePath,
		stdio: 'inherit',
	});
	console.log('Installing front-2 deps (frozen, no scripts)...');
	runCommand('pnpm', ['install', '--frozen-lockfile', '--ignore-scripts'], {
		cwd: worktreePath,
		stdio: 'inherit',
	});
	console.log('Running shared-ts postinstall...');
	runCommand('pnpm', ['--filter', '@org/shared-ts', 'run', 'postinstall'], {
		cwd: worktreePath,
		stdio: 'inherit',
	});
};

const trackedChanges = (worktreePath) => {
	const output = runCommand(
		'git',
		['-C', worktreePath, 'status', '--short', '--untracked-files=no'],
		{
			stdio: 'pipe',
		},
	).stdout;

	return new Set(
		output
			.split('\n')
			.map((line) => line.trim())
			.map((line) => line.slice(3).trim())
			.filter(Boolean),
	);
};

const launchVite = async (worktreePath, host, port) => {
	const cwd = path.join(worktreePath, 'apps', 'front-2');
	const child = spawn(
		'pnpm',
		[
			'exec',
			'vite',
			'dev',
			'--host',
			host,
			'--port',
			String(port),
			'--strictPort',
		],
		{
			cwd,
			stdio: 'inherit',
			env: {
				...process.env,
			},
		},
	);

	const shutdown = (signal) => {
		if (!child.killed) {
			child.kill(signal);
		}
	};
	process.on('SIGINT', () => shutdown('SIGINT'));
	process.on('SIGTERM', () => shutdown('SIGTERM'));

	const [code, signal] = await once(child, 'exit');
	if (signal) {
		console.log(`Vite exited on ${signal}.`);
		return { signal };
	}

	return { code };
};

const main = async () => {
	const worktrees = getWorktrees();
	const byBranch = getBranchPathByMap(worktrees);
	const resolved = await resolveTarget(worktrees, byBranch);
	const worktree = resolved.worktree;
	const prNumber = Number.parseInt(
		requestedRef || String(resolved.source?.number),
		10,
	);

	if (existsSync(path.join(worktree.path, '.env.development'))) {
		err(
			`Refusing to use existing ${path.join(worktree.path, '.env.development')} directly.`,
		);
	}

	await ensureApi();
	ensureDependencies(worktree.path);

	const port = await choosePort(prNumber);
	if (!Number.isInteger(port)) {
		err(`Could not determine a launch port for ${prNumber}.`);
	}
	const host = `pr${prNumber}.localhost`;

	generateEnv(worktree.path, prNumber, port);

	console.log('\n');
	console.log('Launching PR frontend review server');
	console.log(`worktree: ${worktree.path}`);
	console.log(`open:     http://${host}:${port}`);
	console.log('');
	console.log(
		'Tip: keep a second terminal for API/debug while both sessions run.',
	);
	console.log('');

	const beforeDirty = trackedChanges(worktree.path);
	const { code, signal } = await launchVite(worktree.path, host, port);
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
		err(`Vite exited with code ${String(code)}.`);
	}
};

await main();
