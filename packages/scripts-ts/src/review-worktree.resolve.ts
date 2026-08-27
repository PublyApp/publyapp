#!/usr/bin/env node

import { realpathSync } from 'node:fs';

export const GH_AUTH_FAILURE = 'gh-auth-failure';
export const GH_NETWORK_FAILURE = 'gh-network-failure';
export const GH_INVOCATION_FAILURE = 'gh-invocation-failure';

const ISSUE_TOKEN_PATTERN_SOURCE = '(^|[\\/_-])${number}(?=$|[/_-])';

// @ts-expect-error rung-0: add proper type in later rung
const normalizeMessage = (value) =>
	typeof value === 'string' ? value.trim() : '';

// @ts-expect-error rung-0: add proper type in later rung
const createError = (message, code, cause) => {
	const error = new Error(message);
	// @ts-expect-error rung-0: TS2339
	error.code = code;
	if (cause !== undefined) {
		error.cause = cause;
	}

	return error;
};

// @ts-expect-error rung-0: add proper type in later rung
const requireRunner = (runner, name) => {
	if (typeof runner !== 'function') {
		throw new Error(`Missing dependency: ${name} must be a function.`);
	}

	return runner;
};

// @ts-expect-error rung-0: add proper type in later rung
export const parseWorktrees = (raw) => {
	const entries = [];
	let current = null;

	for (const rawLine of raw.split('\n')) {
		const line = rawLine.replace(/\r$/, '');
		if (line.length === 0) {
			continue;
		}

		if (line.startsWith('worktree ')) {
			if (current) {
				entries.push(current);
			}

			current = {
				path: line.slice('worktree '.length),
				head: '',
				branch: null,
			};
			continue;
		}

		if (!current) {
			continue;
		}

		if (line.startsWith('HEAD ')) {
			current.head = line.slice('HEAD '.length);
			continue;
		}

		if (line.startsWith('branch ')) {
			current.branch = line
				.slice('branch '.length)
				.replace(/^refs\/heads\//, '');
		}
	}

	if (current) {
		entries.push(current);
	}

	return entries;
};

// @ts-expect-error rung-0: add proper type in later rung
export const parseTrackedChangesFromStatus = (output) => {
	return new Set(
		output
			.split('\n')
			// @ts-expect-error rung-0: add proper type in later rung
			.map((line) => line.slice(3).trim())
			.filter(Boolean),
	);
};

// @ts-expect-error rung-0: add proper type in later rung
export const getIssueBranchPattern = (number) =>
	new RegExp(
		ISSUE_TOKEN_PATTERN_SOURCE.replace('${number}', String(number)),
		'i',
	);

// Round-3 review (#1238): when an issue number matches several local worktrees (e.g. a
// feature worktree plus a docs/plan-* worktree for the same number), the ambiguity error
// is only useful when none of the candidates is obviously "here". The worktree containing
// the caller's current directory is unambiguous by construction, so prefer it and keep
// the ambiguity error for genuinely ambiguous cases.
// @ts-expect-error rung-0: add proper type in later rung
const realpathIfExists = (value) => {
	try {
		return realpathSync(value);
	} catch {
		return null;
	}
};

// @ts-expect-error rung-0: add proper type in later rung
export const disambiguateWorktreesByCwd = (matches, preferPath) => {
	if (matches.length < 2) {
		return matches;
	}

	// Callers that already know their anchor directory (e.g. a CLI whose resolution must
	// be relative to repoRoot rather than whatever process.cwd() happens to be inside a
	// test runner) pass preferPath explicitly; everyone else means "here".
	const cwd = realpathIfExists(preferPath ?? process.cwd());
	if (!cwd) {
		return matches;
	}

	const here = matches.find(
		// @ts-expect-error rung-0: add proper type in later rung
		(candidate) => realpathIfExists(candidate.path) === cwd,
	);

	if (here) {
		return [here];
	}
	return matches;
};

// @ts-expect-error rung-0: add proper type in later rung
export const getBranchPathByMap = (worktrees) => {
	const map = new Map();
	for (const worktree of worktrees) {
		if (worktree.branch) {
			map.set(worktree.branch, worktree.path);
		}
	}

	return map;
};

// @ts-expect-error rung-0: add proper type in later rung
export const isGhMissingReference = (message) => {
	const lowered = normalizeMessage(message).toLowerCase();
	if (!lowered) {
		return false;
	}

	return (
		((lowered.includes('could not find') ||
			lowered.includes('could not resolve to a pullrequest') ||
			lowered.includes('could not resolve to a pull request')) &&
			(lowered.includes('pullrequest') ||
				lowered.includes('pull request') ||
				lowered.includes('issue'))) ||
		lowered.includes('not found')
	);
};

// @ts-expect-error rung-0: add proper type in later rung
export const isGhAuthFailure = (message) => {
	const lowered = normalizeMessage(message).toLowerCase();
	if (!lowered) {
		return false;
	}

	return (
		lowered.includes('authentication') ||
		lowered.includes('login') ||
		lowered.includes('not authenticated') ||
		lowered.includes('forbidden') ||
		lowered.includes('unauthorized') ||
		lowered.includes('http 401')
	);
};

// @ts-expect-error rung-0: add proper type in later rung
export const isGhNetworkFailure = (message) => {
	const lowered = normalizeMessage(message).toLowerCase();
	return (
		lowered.includes('network') ||
		lowered.includes('timed out') ||
		lowered.includes('unable to connect') ||
		lowered.includes('econn') ||
		lowered.includes('getaddrinfo') ||
		lowered.includes('enotfound') ||
		lowered.includes('error connecting to') ||
		lowered.includes('check your internet connection')
	);
};

// @ts-expect-error rung-0: add proper type in later rung
export const runGhJson = async (args, { runGh } = {}) => {
	const run = requireRunner(runGh, 'runGh');
	const result = await run(args);
	const status = result.status ?? -1;

	if (status === 0) {
		const output = normalizeMessage(result.stdout);
		if (output.length === 0) {
			return null;
		}

		try {
			return JSON.parse(output);
		} catch (error) {
			throw createError(
				`gh returned invalid JSON for ${args.join(' ')}`,
				GH_NETWORK_FAILURE,
				error,
			);
		}
	}

	const message =
		normalizeMessage(result.stderr) || normalizeMessage(result.stdout);
	if (isGhMissingReference(message)) {
		return null;
	}

	if (isGhAuthFailure(message)) {
		// @ts-expect-error rung-0: TS2554
		throw createError(
			`GitHub auth is required to resolve PR/issue references. ${message}`,
			GH_AUTH_FAILURE,
		);
	}

	if (isGhNetworkFailure(message)) {
		// @ts-expect-error rung-0: TS2554
		throw createError(
			`gh network failure for ${args[0]} ${args[1]}: ${message}`,
			GH_NETWORK_FAILURE,
		);
	}

	// @ts-expect-error rung-0: TS2554
	throw createError(
		message.length > 0
			? `gh failed for ${args[0]} ${args[1]}: ${message}`
			: `gh failed for ${args[0]} ${args[1]}.`,
		GH_INVOCATION_FAILURE,
	);
};

// @ts-expect-error rung-0: add proper type in later rung
export const runPrByNumber = (number, { runGh }) =>
	runGhJson(
		[
			'pr',
			'view',
			String(number),
			'--json',
			'number,state,title,headRefName,headRefOid',
		],
		{ runGh },
	);

// @ts-expect-error rung-0: add proper type in later rung
export const runIssueByNumber = (number, { runGh }) =>
	runGhJson(['issue', 'view', String(number), '--json', 'title,number'], {
		runGh,
	});

// @ts-expect-error rung-0: add proper type in later rung
export const resolveByPull = (pr, worktrees) => {
	const exact = worktrees.find(
		// @ts-expect-error rung-0: add proper type in later rung
		(worktree) => worktree.branch === pr.headRefName,
	);
	if (exact) {
		return exact;
	}

	// @ts-expect-error rung-0: add proper type in later rung
	return worktrees.find((worktree) => worktree.head === pr.headRefOid);
};

export const resolveByNumber = async (
	// @ts-expect-error rung-0: add proper type in later rung
	number,
	// @ts-expect-error rung-0: add proper type in later rung
	worktrees,
	{
		// @ts-expect-error rung-0: TS2339
		runPrByNumber: runPrByNumberFn,
		// @ts-expect-error rung-0: TS2339
		runIssueByNumber: runIssueByNumberFn,
		// @ts-expect-error rung-0: TS2339
		runGh,
		// @ts-expect-error rung-0: TS2339
		preferCwdPath,
	} = {},
) => {
	const runPr = runPrByNumberFn
		? // @ts-expect-error rung-0: add proper type in later rung
			(requestedNumber) => runPrByNumberFn(requestedNumber, { runGh })
		: // @ts-expect-error rung-0: add proper type in later rung
			(requestedNumber) => runPrByNumber(requestedNumber, { runGh });
	const runIssue = runIssueByNumberFn
		? // @ts-expect-error rung-0: add proper type in later rung
			(requestedNumber) => runIssueByNumberFn(requestedNumber, { runGh })
		: // @ts-expect-error rung-0: add proper type in later rung
			(requestedNumber) => runIssueByNumber(requestedNumber, { runGh });

	const pr = await runPr(number);
	if (pr) {
		const worktree = resolveByPull(pr, worktrees);
		if (worktree) {
			return { kind: 'pr', source: pr, worktree };
		}

		return { kind: 'pr-unmatched', source: pr, requested: number };
	}

	const issue = await runIssue(number);
	if (!issue) {
		return { kind: 'not-found', requested: number };
	}

	const pattern = getIssueBranchPattern(number);
	// @ts-expect-error rung-0: add proper type in later rung
	const matches = worktrees.filter((worktree) =>
		worktree.branch ? pattern.test(worktree.branch) : false,
	);
	if (matches.length === 0) {
		return { kind: 'not-found', requested: number, source: issue };
	}

	const disambiguated = disambiguateWorktreesByCwd(matches, preferCwdPath);
	if (disambiguated.length > 1) {
		return {
			kind: 'issue-ambiguous',
			source: issue,
			requested: number,
			worktrees: disambiguated,
		};
	}

	return { kind: 'issue', source: issue, worktree: disambiguated[0] };
};

export const resolveInteractivePicker = async (
	// @ts-expect-error rung-0: add proper type in later rung
	worktrees,
	// @ts-expect-error rung-0: add proper type in later rung
	byBranch,
	// @ts-expect-error rung-0: TS2339
	{ runOpenPrs, askChoice, runByNumber, runGh } = {},
) => {
	const loadOpenPrs =
		runOpenPrs ??
		(() =>
			runGhJson(
				['pr', 'list', '--state', 'open', '--json', 'number,title,headRefName'],
				{ runGh },
			));
	const pick =
		askChoice ??
		(() => {
			throw new Error('askChoice is required for interactive selection.');
		});
	const resolve =
		// @ts-expect-error rung-0: add proper type in later rung
		runByNumber ?? ((number) => resolveByNumber(number, worktrees, { runGh }));

	const openPrs = await loadOpenPrs();
	if (!Array.isArray(openPrs) || openPrs.length === 0) {
		throw new Error('No open PRs found for picker.');
	}

	const rows = openPrs
		.map((pr) => ({
			number: pr.number,
			title: pr.title,
			branch: pr.headRefName,
			path: byBranch?.has(pr.headRefName)
				? (byBranch.get(pr.headRefName) ?? 'none')
				: 'none',
			hasPath: byBranch?.has(pr.headRefName) ?? false,
		}))
		.sort((left, right) => {
			if (left.hasPath === right.hasPath) {
				return left.number - right.number;
			}

			if (left.hasPath) {
				return -1;
			}
			return 1;
		});

	const lines = rows.map(
		(row) => `#${row.number} | ${row.branch} | ${row.path} | ${row.title}`,
	);
	const selected = await pick(
		'Choose PR to review (open PRs with worktrees first):',
		lines,
	);

	if (!Number.isInteger(selected) || selected < 0 || selected >= rows.length) {
		throw new Error(`Invalid selection: ${String(selected)}`);
	}

	return resolve(rows[selected].number);
};

export const resolveTarget = async (
	// @ts-expect-error rung-0: add proper type in later rung
	worktrees,
	// @ts-expect-error rung-0: add proper type in later rung
	byBranch,
	{
		// @ts-expect-error rung-0: TS2339
		requestedRef,
		// @ts-expect-error rung-0: TS2339
		hasInteractiveTerminal,
		// @ts-expect-error rung-0: TS2339
		resolveInteractivePicker: resolvePicker,
		...rest
	} = {},
) => {
	const request = requestedRef?.trim() ?? '';
	if (!request) {
		if (!hasInteractiveTerminal) {
			throw new Error(
				'No PR/issue ref provided in a non-interactive terminal.',
			);
		}

		const picker =
			resolvePicker ??
			// @ts-expect-error rung-0: add proper type in later rung
			((pickerWorktrees, pickerByBranch, pickerOptions) =>
				resolveInteractivePicker(
					pickerWorktrees,
					pickerByBranch,
					pickerOptions,
				));
		return picker(worktrees, byBranch, rest);
	}

	if (!/^\d+$/.test(request)) {
		throw new Error(`Expected a PR or issue number, got ${request}.`);
	}

	return resolveByNumber(Number.parseInt(request, 10), worktrees, { ...rest });
};
