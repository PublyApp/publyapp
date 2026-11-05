#!/usr/bin/env node
// `just dev [PR | issue | branch]` (#2305): find or create the matching worktree, prepare
// it, stop the stack already running, then run the Aspire AppHost from that worktree.
// One app at a time (ports 5454/5000/5050). Messages are French: the owner reads them.

import { execFileSync, spawn } from 'node:child_process';
import {
	constants,
	copyFileSync,
	existsSync,
	readFileSync,
	readlinkSync,
	readdirSync,
	rmSync,
} from 'node:fs';
import { connect } from 'node:net';
import path from 'node:path';
import process from 'node:process';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const PORTS = [5454, 5000, 5050];
const ENV_FILE = '.env.development';
// ponytail: marker check, not a version check — any branch created from #2305 has it.
const CURRENT_APPHOST_MARKER = 'WithPnpm(install: false)';

export const parseRef = (ref) => {
	const value = (ref ?? '').trim();
	if (value === '') {
		return { kind: 'none' };
	}
	const number = /^#?(\d+)$/.exec(value);
	if (number) {
		return { kind: 'number', number: Number(number[1]) };
	}
	return { kind: 'branch', branch: value };
};

export const worktreeDirName = (branch) => {
	const parts = branch.split('/');
	return (parts.length > 1 ? parts.slice(1) : parts).join('-');
};

export const issueBranchName = (number, title, labels) => {
	const slug = title
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+/, '')
		.slice(0, 50)
		.replace(/-+$/, '');
	return `${labels.includes('bug') ? 'fix' : 'feat'}/${String(number)}-${slug}`;
};

export const isCurrentAppHost = (programSource) =>
	programSource.includes(CURRENT_APPHOST_MARKER);

// Directory-boundary containment (#2317): a bare prefix also matches a sibling
// clone (`.../publyapp-foo` starts with `.../publyapp`), which once made
// `just dev` stop the other clone's stack.
export const isUnderPath = (candidate, root) =>
	candidate === root || candidate.startsWith(root + path.sep);

// pnpm writes node_modules/.modules.yaml at the END of a successful install, so
// its presence — not the folder's — proves the install finished (#2317).
export const dependenciesInstalled = (worktree) =>
	existsSync(path.join(worktree, 'node_modules', '.modules.yaml'));

const say = (message) => {
	process.stdout.write(`▶ ${message}\n`);
};

const fail = (message) => {
	process.stderr.write(`✖ ${message}\n`);
	process.exit(1);
};

const run = (command, args, cwd) =>
	execFileSync(command, args, {
		cwd,
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'pipe'],
	}).trim();

const tryRun = (command, args, cwd) => {
	try {
		return run(command, args, cwd);
	} catch {
		return null;
	}
};

const mainClone = () =>
	path.dirname(
		path.resolve(
			run('git', ['rev-parse', '--path-format=absolute', '--git-common-dir']),
		),
	);

const worktreeByBranch = (clone) => {
	const byBranch = new Map();
	let current = null;
	for (const line of run(
		'git',
		['worktree', 'list', '--porcelain'],
		clone,
	).split('\n')) {
		if (line.startsWith('worktree ')) {
			current = line.slice('worktree '.length);
		} else if (line.startsWith('branch refs/heads/') && current) {
			byBranch.set(line.slice('branch refs/heads/'.length), current);
		}
	}
	return byBranch;
};

const ghJson = (args, clone) => {
	const out = tryRun('gh', args, clone);
	return out === null ? null : JSON.parse(out);
};

// Issue → existing branch, in the spec's order: open PR closing it, branch linked on
// GitHub, local branch named */<n>-*. Several hits → refuse with the list.
const existingIssueBranch = (number, clone) => {
	const prs =
		ghJson(
			[
				'pr',
				'list',
				'--state',
				'open',
				'--limit',
				'200',
				'--json',
				'headRefName,closingIssuesReferences',
			],
			clone,
		) ?? [];
	const fromPrs = prs
		.filter((pr) =>
			pr.closingIssuesReferences.some((issue) => issue.number === number),
		)
		.map((pr) => pr.headRefName);
	const linked = (
		tryRun('gh', ['issue', 'develop', '--list', String(number)], clone) ?? ''
	)
		.split('\n')
		.map((line) => line.split('\t')[0].trim())
		.filter(Boolean);
	const local = (
		tryRun(
			'git',
			[
				'branch',
				'--format=%(refname:short)',
				'--list',
				`*/${String(number)}-*`,
			],
			clone,
		) ?? ''
	)
		.split('\n')
		.filter(Boolean);
	const hits = [...new Set([...fromPrs, ...linked, ...local])];
	if (hits.length > 1) {
		fail(
			`Plusieurs branches correspondent à l'issue #${String(number)} : ${hits.join(', ')}. Relance avec le nom de la branche.`,
		);
	}
	return hits[0] ?? null;
};

// Returns { branch, base } — base is set only when the branch must be created.
const resolveBranch = (ref, clone) => {
	if (ref.kind === 'branch') {
		return { branch: ref.branch, base: null };
	}
	const pr = ghJson(
		['pr', 'view', String(ref.number), '--json', 'headRefName'],
		clone,
	);
	if (pr) {
		return { branch: pr.headRefName, base: null };
	}
	const issue = ghJson(
		['issue', 'view', String(ref.number), '--json', 'title,labels'],
		clone,
	);
	if (!issue) {
		fail(`#${String(ref.number)} n'est ni une PR ni une issue de ce dépôt.`);
	}
	const existing = existingIssueBranch(ref.number, clone);
	if (existing) {
		return { branch: existing, base: null };
	}
	const labels = issue.labels.map((label) => label.name);
	return {
		branch: issueBranchName(ref.number, issue.title, labels),
		base: 'origin/develop',
	};
};

const ensureWorktree = (ref, clone) => {
	if (ref.kind === 'none') {
		return run('git', ['rev-parse', '--show-toplevel']);
	}
	const { branch, base } = resolveBranch(ref, clone);
	const existing = worktreeByBranch(clone).get(branch);
	if (existing) {
		return existing;
	}
	const target = path.join(clone, '.worktrees', worktreeDirName(branch));
	if (existsSync(target)) {
		fail(`Le dossier ${target} existe déjà pour une autre branche.`);
	}
	say(`Création du worktree ${target} (branche ${branch})…`);
	tryRun('git', ['fetch', 'origin', base ? 'develop' : branch], clone);
	const hasLocal =
		tryRun(
			'git',
			['show-ref', '--verify', '--quiet', `refs/heads/${branch}`],
			clone,
		) !== null;
	const hasRemote =
		tryRun(
			'git',
			['show-ref', '--verify', '--quiet', `refs/remotes/origin/${branch}`],
			clone,
		) !== null;
	if (base) {
		run('git', ['worktree', 'add', '-b', branch, target, base], clone);
	} else if (hasLocal || hasRemote) {
		run('git', ['worktree', 'add', target, branch], clone);
	} else {
		fail(`La branche ${branch} n'existe ni en local ni sur origin.`);
	}
	return target;
};

const prepare = (worktree, clone) => {
	const env = path.join(worktree, ENV_FILE);
	const source = path.join(clone, ENV_FILE);
	if (!existsSync(env) && existsSync(source)) {
		say(`Copie de ${ENV_FILE}…`);
		copyFileSync(source, env, constants.COPYFILE_EXCL);
	}
	say('Restauration des outils .NET…');
	execFileSync('dotnet', ['tool', 'restore'], {
		cwd: worktree,
		stdio: 'inherit',
	});
	if (!dependenciesInstalled(worktree)) {
		say('Installation des dépendances (quelques minutes la première fois)…');
		// Ctrl+C hits pnpm and us: the no-op listener keeps this process alive
		// (execFileSync blocks the event loop, a real handler would never run), then
		// the throw carries the child's signal (#2317).
		const ignore = () => {};
		process.on('SIGINT', ignore);
		try {
			execFileSync('pnpm', ['install', '--frozen-lockfile'], {
				cwd: worktree,
				stdio: 'inherit',
			});
		} catch (error) {
			if (error?.signal) {
				fail('Installation interrompue : relance just dev.');
			}
			throw error;
		} finally {
			process.off('SIGINT', ignore);
		}
	}
};

const portBusy = (port) =>
	new Promise((resolve) => {
		const socket = connect(port, '127.0.0.1');
		socket.on('connect', () => {
			socket.end();
			resolve(true);
		});
		socket.on('error', () => resolve(false));
	});

const busyPorts = async () => {
	const states = await Promise.all(PORTS.map((port) => portBusy(port)));
	return PORTS.filter((_, index) => states[index]);
};

// #2305: "Prêt" is announced only once BOTH listeners answer. The front sat on a
// random Aspire-allocated port while dev.ts claimed 5050, unchecked.
export const READY_TARGETS = [
	{
		label: "l'API (http://127.0.0.1:5000/health)",
		url: 'http://127.0.0.1:5000/health',
	},
	{
		label: "l'interface (http://127.0.0.1:5050/)",
		url: 'http://127.0.0.1:5050/',
	},
];

export const readinessFailure = (labels) =>
	`La pile n'est pas prête : ${labels.join(' et ')} ${labels.length > 1 ? 'ne répondent' : 'ne répond'} pas (200 attendu).`;

// Stop escalation (#2305): SIGINT first (the terminal's Ctrl+C), SIGTERM once the
// grace window expires. A SIGTERM request starts at SIGTERM.
export const stopEscalation = (signal) =>
	signal === 'SIGINT'
		? [
				{ signal: 'SIGINT', waitMs: 15_000 },
				{ signal: 'SIGTERM', waitMs: 15_000 },
			]
		: [{ signal: 'SIGTERM', waitMs: 30_000 }];

// The AppHost artifact path, not a bare "PublyApp.AppHost" substring: the latter
// also matches the `dotnet run --project apps/apphost` launcher and any editor's
// language server, and we must never signal a process that is not our AppHost.
export const isPublyAppHostCmdline = (cmdline) =>
	cmdline.includes(path.join('.artifacts', 'bin', 'PublyApp.AppHost'));

const probeReady = async (url) => {
	try {
		const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
		return response.ok;
	} catch {
		return false;
	}
};

const missingReadyTargets = async () => {
	const states = await Promise.all(
		READY_TARGETS.map((target) => probeReady(target.url)),
	);
	return READY_TARGETS.filter((_, index) => !states[index]).map(
		(target) => target.label,
	);
};

const waitPortsFree = async (timeoutMs) => {
	const deadline = Date.now() + timeoutMs;
	for (;;) {
		if ((await busyPorts()).length === 0) {
			return true;
		}
		if (Date.now() >= deadline) {
			return false;
		}
		await sleep(500);
	}
};

const processGroupOf = (pid) => {
	try {
		const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
		// stat = "pid (comm) state ppid pgrp ..." — comm may contain spaces/parens,
		// so split after the LAST ')'. [0]=state [1]=ppid [2]=pgrp.
		const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
		return Number(fields[2]);
	} catch {
		return null;
	}
};

const signalPid = (pid, signal, grouped) => {
	try {
		process.kill(grouped ? -pid : pid, signal);
		return true;
	} catch {
		return false;
	}
};

// SIGINT, wait, SIGTERM, wait. A process is signalled with its process group ONLY
// when it leads that group: a foreign AppHost launched from a terminal shares the
// terminal's job group, and signalling -pid there would kill unrelated processes.
const stopProcess = async (pid, signal) => {
	const grouped = processGroupOf(pid) === pid;
	for (const step of stopEscalation(signal)) {
		signalPid(pid, step.signal, grouped);
		if (await waitPortsFree(step.waitMs)) {
			return true;
		}
	}
	return false;
};

// Our stack = an AppHost process whose cwd is the main clone or one of its worktrees.
const ourAppHostPids = (clone) =>
	readdirSync('/proc')
		.filter((entry) => /^\d+$/.test(entry) && Number(entry) !== process.pid)
		.filter((pid) => {
			try {
				const cmdline = readFileSync(`/proc/${pid}/cmdline`, 'utf8');
				const cwd = readlinkSync(`/proc/${pid}/cwd`);
				return isPublyAppHostCmdline(cmdline) && isUnderPath(cwd, clone);
			} catch {
				return false;
			}
		})
		.map(Number);

const stopPrevious = async (clone) => {
	const pids = ourAppHostPids(clone);
	if (pids.length > 0) {
		say("Arrêt de l'appli déjà lancée…");
		for (const pid of pids) {
			await stopProcess(pid, 'SIGINT');
		}
	}
	if (await waitPortsFree(30_000)) {
		return;
	}
	const still = await busyPorts();
	const holders = tryRun('ss', ['-ltnp']) ?? '';
	const lines = holders
		.split('\n')
		.filter((line) => still.some((port) => line.includes(`:${String(port)} `)));
	fail(
		`Ports encore occupés (${still.join(', ')}) par autre chose que notre appli. Libère-les puis relance :\n${lines.join('\n')}`,
	);
};

const readProgramSource = (worktree) => {
	try {
		return readFileSync(
			path.join(worktree, 'apps', 'apphost', 'Program.cs'),
			'utf8',
		);
	} catch {
		return null;
	}
};

const main = async () => {
	const ref = parseRef(process.argv.slice(2).join(' '));
	const clone = mainClone();
	const worktree = ensureWorktree(ref, clone);
	const programSource = readProgramSource(worktree);
	if (programSource === null || !isCurrentAppHost(programSource)) {
		fail('Cette branche est trop ancienne : mets-la à jour avec develop.');
	}
	prepare(worktree, clone);
	await stopPrevious(clone);
	say(
		`Lancement depuis ${worktree} — API http://localhost:5000, interface http://localhost:5050`,
	);
	const errorFile = path.join(
		worktree,
		'apps',
		'api',
		'.artifacts',
		'dev-migrate-error.txt',
	);
	rmSync(errorFile, { force: true });
	const child = spawn(
		'dotnet',
		[
			'run',
			'--project',
			'apps/apphost',
			'--property:OpenApiGenerateDocuments=false',
		],
		{
			cwd: worktree,
			stdio: 'inherit',
			// Own process group (#2305): signalling -pid reaches dotnet run, the
			// AppHost, DCP and the Vite child. Without it a SIGINT to dev.ts only
			// reached the launcher and left the stack (and its ports) behind.
			detached: true,
		},
	);
	let stopping = false;
	const stop = async (signal, exitCode = 0) => {
		if (stopping) {
			return;
		}
		stopping = true;
		say('Arrêt de la pile…');
		if (child.pid !== undefined) {
			await stopProcess(child.pid, signal);
		}
		const still = await busyPorts();
		if (still.length > 0) {
			process.stderr.write(
				`✖ Ports encore occupés après l'arrêt (${still.join(', ')}).\n`,
			);
		}
		process.exit(exitCode);
	};
	process.on('SIGINT', () => {
		void stop('SIGINT');
	});
	process.on('SIGTERM', () => {
		void stop('SIGTERM');
	});
	child.on('exit', (code) => {
		if (!stopping) {
			process.exit(code ?? 0);
		}
	});
	const startedAt = Date.now();
	for (;;) {
		await sleep(2000);
		if (existsSync(errorFile)) {
			process.stderr.write(`\n✖ ${readFileSync(errorFile, 'utf8')}\n`);
			await stop('SIGINT', 1);
			return;
		}
		const missing = await missingReadyTargets();
		if (missing.length === 0) {
			say('Prêt : API http://localhost:5000, interface http://localhost:5050');
			return;
		}
		// 3 minutes covers a cold migration + boot (#2305 measured ~25 s on a warm DB).
		if (Date.now() - startedAt > 180_000) {
			process.stderr.write(`\n✖ ${readinessFailure(missing)}\n`);
			await stop('SIGINT', 1);
			return;
		}
	}
};

if (
	process.argv[1] &&
	path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
	await main();
}
