#!/usr/bin/env node

export const GH_AUTH_FAILURE = 'gh-auth-failure';
export const GH_NETWORK_FAILURE = 'gh-network-failure';

const ISSUE_TOKEN_PATTERN_SOURCE = '(^|[\\/_-])${number}(?=$|[/_-])';

const normalizeMessage = (value) =>
	typeof value === 'string' ? value.trim() : '';

const createError = (message, code, cause) => {
	const error = new Error(message);
	error.code = code;
	if (cause !== undefined) {
		error.cause = cause;
	}

	return error;
};

const requireRunner = (runner, name) => {
	if (typeof runner !== 'function') {
		throw new Error(`Missing dependency: ${name} must be a function.`);
	}

	return runner;
};

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

export const parseTrackedChangesFromStatus = (output) => {
	return new Set(
		output
			.split('\n')
			.map((line) => line.slice(3).trim())
			.filter(Boolean),
	);
};

export const getIssueBranchPattern = (number) =>
	new RegExp(
		ISSUE_TOKEN_PATTERN_SOURCE.replace('${number}', String(number)),
		'i',
	);

export const getBranchPathByMap = (worktrees) => {
	const map = new Map();
	for (const worktree of worktrees) {
		if (worktree.branch) {
			map.set(worktree.branch, worktree.path);
		}
	}

	return map;
};

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

const isGhNetworkFailure = (message) => {
	const lowered = normalizeMessage(message).toLowerCase();
	return (
		lowered.includes('network') ||
		lowered.includes('timed out') ||
		lowered.includes('unable to connect') ||
		lowered.includes('econn') ||
		lowered.includes('getaddrinfo') ||
		lowered.includes('enotfound')
	);
};

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
		throw createError(
			`GitHub auth is required to resolve PR/issue references. ${message}`,
			GH_AUTH_FAILURE,
		);
	}

	if (message.length > 0 || isGhNetworkFailure(message)) {
		throw createError(
			message.length > 0
				? `gh failed for ${args[0]} ${args[1]}: ${message}`
				: `gh failed for ${args[0]} ${args[1]}.`,
			GH_NETWORK_FAILURE,
		);
	}

	throw createError(`gh failed for ${args[0]} ${args[1]}.`, GH_NETWORK_FAILURE);
};

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

export const runIssueByNumber = (number, { runGh }) =>
	runGhJson(['issue', 'view', String(number), '--json', 'title,number'], {
		runGh,
	});

export const resolveByPull = (pr, worktrees) => {
	const exact = worktrees.find(
		(worktree) => worktree.branch === pr.headRefName,
	);
	if (exact) {
		return exact;
	}

	return worktrees.find((worktree) => worktree.head === pr.headRefOid);
};

export const resolveByNumber = async (
	number,
	worktrees,
	{
		runPrByNumber: runPrByNumberFn,
		runIssueByNumber: runIssueByNumberFn,
		runGh,
	} = {},
) => {
	const runPr = runPrByNumberFn
		? (requestedNumber) => runPrByNumberFn(requestedNumber, { runGh })
		: (requestedNumber) => runPrByNumber(requestedNumber, { runGh });
	const runIssue = runIssueByNumberFn
		? (requestedNumber) => runIssueByNumberFn(requestedNumber, { runGh })
		: (requestedNumber) => runIssueByNumber(requestedNumber, { runGh });

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
	const matches = worktrees.filter((worktree) =>
		worktree.branch ? pattern.test(worktree.branch) : false,
	);
	if (matches.length === 0) {
		return { kind: 'not-found', requested: number, source: issue };
	}

	if (matches.length > 1) {
		return { kind: 'issue-ambiguous', source: issue, worktrees: matches };
	}

	return { kind: 'issue', source: issue, worktree: matches[0] };
};

export const resolveInteractivePicker = async (
	worktrees,
	byBranch,
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

			return left.hasPath ? -1 : 1;
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
	worktrees,
	byBranch,
	{
		requestedRef,
		hasInteractiveTerminal,
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
