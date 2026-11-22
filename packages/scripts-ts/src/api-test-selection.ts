import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import process from 'node:process';

import { LANE_PATTERNS } from './ci-changed-paths.ts';

// PR-time API test selection (ci-audit.md item 1 / api-tests-research.md API-3).
//
// On a `pull_request` run the API lane runs only the spec classes of the
// modules the diff touches; `merge_group` and every other event keep running
// the whole suite, because the queue is what certifies the merge. A PR may run
// less than the queue; it must never be the only thing that ran.
//
// The mapping is deliberately narrow and fails closed: a module is selected
// only when EVERY changed path the API lane can be reached by (the classifier's
// own api pattern) sits under `apps/api/Modules/<Module>/`. Shared code
// (`Lib/`, `Data/`, `Infrastructure/`, `Migrations/`), projects, config, the
// workflow, lockfiles, the justfile, apphost/shared/client packages, and any
// deleted or renamed path fall back to the full suite. Paths outside the API
// lane (front, docs) cannot affect the suite and are ignored, so a mixed
// front+module PR still selects its module.
//
// `undefined` always means "run the full suite" — the same value for a
// deliberate full-suite decision and for a selection failure, so a broken git
// read can never narrow a run.

export type ChangedPath = { status: string; paths: string[] };

export type ApiTestSelection =
	| { mode: 'full'; reason: string }
	| { mode: 'modules'; modules: string[]; reason: string };

const MODULE_PATH = /^apps\/api\/Modules\/([A-Za-z0-9._-]+)\/.+/;

// `git diff --name-status` letters that make a module mapping unsafe: deleted,
// renamed (the old path is gone from the listing the planner sees), copied.
const UNMAPPABLE_STATUS = /^[DRC]/;

const full = (reason: string): ApiTestSelection => ({ mode: 'full', reason });

/**
 * Parses `git diff --name-status -z -M` output. With `-z`, every record is
 * `<status>\0<path>\0`, except renames/copies which are
 * `<status>\0<old path>\0<new path>\0`. A malformed record throws: a diff the
 * selector cannot read must fall back to the full suite, never to a guess.
 */
export const parseNameStatus = (output: string): ChangedPath[] => {
	const tokens = output.split('\0');
	if (tokens.at(-1) === '') {
		tokens.pop();
	}

	const entries: ChangedPath[] = [];
	let index = 0;
	while (index < tokens.length) {
		const status = tokens[index] ?? '';
		index += 1;
		const pathCount = /^[RC]/.test(status) ? 2 : 1;
		const paths = tokens.slice(index, index + pathCount);
		if (
			status === '' ||
			paths.length !== pathCount ||
			paths.some((entry) => entry === '')
		) {
			throw new Error(
				`Unparseable git name-status record near token ${index}: ${JSON.stringify(tokens.slice(Math.max(0, index - 2), index + 2))}`,
			);
		}
		index += pathCount;
		entries.push({ status, paths });
	}
	return entries;
};

/**
 * Pure decision function for one pull-request diff. Returns the modules to run,
 * or the reason the whole suite must run instead.
 */
export const selectApiTests = ({
	eventName,
	changedPaths,
}: {
	eventName: string;
	changedPaths: ChangedPath[];
}): ApiTestSelection => {
	if (eventName !== 'pull_request') {
		return full(
			`${eventName || 'non-pull_request'} event: the merge queue and pushes run the whole API suite`,
		);
	}

	const apiPattern = new RegExp(LANE_PATTERNS.api);
	const relevant = changedPaths.filter((entry) =>
		entry.paths.some((path) => apiPattern.test(path)),
	);

	if (relevant.length === 0) {
		return full('no API-relevant changed path');
	}

	const unmappable = relevant.find((entry) =>
		UNMAPPABLE_STATUS.test(entry.status),
	);
	if (unmappable !== undefined) {
		return full(
			`deleted/renamed path ${unmappable.paths.join(' -> ')} cannot be mapped to a module`,
		);
	}

	const modules = new Set<string>();
	for (const entry of relevant) {
		for (const path of entry.paths) {
			const match = MODULE_PATH.exec(path);
			if (match === null) {
				return full(
					`${path} is API-relevant but not under apps/api/Modules/<Module>/`,
				);
			}
			modules.add(match[1]);
		}
	}

	if (modules.size === 0) {
		return full('no module could be derived from the API-relevant paths');
	}

	const selected = [...modules].sort();
	return {
		mode: 'modules',
		modules: selected,
		reason: `every API-relevant path is under Modules/${selected.join(', Modules/')}`,
	};
};

/** The base commit of the pull request, from the event payload GitHub writes. */
const readBaseSha = (): string | undefined => {
	const eventPath = process.env.GITHUB_EVENT_PATH;
	if (eventPath === undefined || eventPath === '') {
		return undefined;
	}
	try {
		const payload = JSON.parse(readFileSync(eventPath, 'utf8')) as {
			pull_request?: { base?: { sha?: unknown } };
		};
		const sha = payload.pull_request?.base?.sha;
		if (typeof sha === 'string' && /^[0-9a-f]{40}$/.test(sha)) {
			return sha;
		}
		return undefined;
	} catch {
		return undefined;
	}
};

const git = (args: string[]): string =>
	execFileSync('git', args, {
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'inherit'],
		maxBuffer: 64 * 1024 * 1024,
	});

/**
 * Reads the PR's own changed paths. The base commit is usually absent from the
 * shallow CI checkout, so fetch it first — a failure here throws and the caller
 * falls back to the full suite.
 */
export const readChangedPaths = (baseSha: string): ChangedPath[] => {
	try {
		git(['cat-file', '-e', `${baseSha}^{commit}`]);
	} catch {
		git(['fetch', '--no-tags', '--depth=1', 'origin', baseSha]);
	}
	return parseNameStatus(
		git(['diff', '--name-status', '-z', '-M', baseSha, 'HEAD']),
	);
};

const defaultChangedPaths = (): ChangedPath[] => {
	const baseSha = readBaseSha();
	if (baseSha === undefined) {
		throw new Error('the pull_request event payload carries no base commit');
	}
	return readChangedPaths(baseSha);
};

/**
 * The entry point the shard runner uses. Returns the modules to run, or
 * `undefined` for the full suite. Any failure (missing base, failed fetch,
 * malformed diff) is logged and resolves to the full suite.
 */
export const resolveApiModules = ({
	eventName = process.env.GITHUB_EVENT_NAME ?? '',
	changedPaths = defaultChangedPaths,
}: {
	eventName?: string;
	changedPaths?: () => ChangedPath[];
} = {}): string[] | undefined => {
	if (eventName !== 'pull_request') {
		return undefined;
	}

	try {
		const selection = selectApiTests({
			eventName,
			changedPaths: changedPaths(),
		});
		if (selection.mode === 'full') {
			console.log(`API test selection: full suite — ${selection.reason}`);
			return undefined;
		}
		console.log(
			`API test selection: ${selection.modules.join(', ')} — ${selection.reason}`,
		);
		return selection.modules;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.log(
			`::warning::API test selection unavailable (${message}); running the full suite`,
		);
		return undefined;
	}
};
