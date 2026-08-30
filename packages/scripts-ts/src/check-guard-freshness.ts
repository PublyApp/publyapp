import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import path from 'node:path';

// #1889: a pull request that branches from a base predating a guard
// widening inherits the OLD classifier pattern from its own HEAD's
// workflow file, so a check that ran green on the PR's tree can become
// red on develop the moment both land. The historical incident is #1886
// (develop went red on 2026-08-30 because a docs-archive widening from
// PR #1874 met in-flight PRs whose bases predated the widening).
//
// The fix runs on a pull_request event: the `changes` job fetches the
// workflow file at the PR's base SHA AND at develop's tip, extracts each
// file's classifier pattern (the regex the `changes` step actually
// pattern-matches the PR's file list against), and reports the PR stale
// if develop's pattern is a strict superset of the base's. The
// accompanying `GITHUB_OUTPUT` write lets the workflow's own `if:
// needs.changes.outputs.relevant == 'true'` gate fire on the freshness
// verdict, exactly the same plumbing the relevance check already uses.
//
// The function is pure (no I/O, no Date, no randomness) so the
// regression test that pins its behavior is a plain vitest case; the
// CLI shell at the bottom is the only place `gh api` is called, and the
// tests stub it out by calling the pure function directly.

/**
 * Parses one classifier pattern literal (the `node "$CLASSIFIER" '<pattern>'`
 * invocation's single-quoted argument) into a list of literal alternatives,
 * each of which is a POSIX path. The classifier patterns in
 * .github/workflows/docs-archive.yml and friends are anchored regexes
 * shaped `^(...|...|...$)`: a leading `^` (start-of-string anchor), an
 * outer parenthesised group whose body is `|`-separated branches, and
 * a trailing `$` (end-of-string anchor) at the end of the LAST branch
 * (the dollar sign is the last character of the body, immediately
 * followed by the group's closing paren).
 *
 * The grammar this parser understands is therefore:
 *   - the pattern starts with `^(` (anchor + open paren)
 *   - the pattern ends with `$)` (inner anchor + close paren)
 *   - inside, the body is `|`-separated branches, each one either
 *     a path-prefix glob (`docs/`) or a fully-anchored path literal
 *     (`packages/...ts$`)
 *
 * Patterns the parser does not understand (multi-branch alternation at
 * the top level, character classes, parens NOT in a recognised position)
 * return `undefined` so the caller can fail loud rather than silently
 * miscompare.
 *
 * @param {unknown} pattern
 * @returns {string[] | undefined}
 */
export const parseClassifierAlternatives = (
	pattern: unknown,
): string[] | undefined => {
	if (typeof pattern !== 'string') {
		return undefined;
	}

	// The shipped shape is `^(...|...|...$)` — a literal `^` followed
	// by a parenthesised group whose last branch ends in `$`. We refuse
	// any other shape because the repo's classifier patterns never use
	// one and a parse miss is the safest outcome.
	if (!pattern.startsWith('^(') || !pattern.endsWith('$)')) {
		return undefined;
	}

	// Strip the leading `^(` and trailing `)`. The body keeps its inner
	// `$` anchor at the end of the last branch, so the prefix-glob
	// branches end in `/` and the literal-alternative branches end
	// in `$`.
	const body = pattern.slice(2, -1);

	if (body.length === 0) {
		return [];
	}

	const branches = body.split('|');

	if (branches.length === 0) {
		return [];
	}

	// Each branch is one of:
	//   - `docs/`                (path-prefix glob, ends in `/`)
	//   - `path/to/file\.ts$`    (anchored literal, ends in `$`)
	// The freshness check only needs set-equality, not re-anchoring,
	// so we preserve the literal text verbatim and let set comparison
	// handle the rest.
	const result = [];

	for (const branch of branches) {
		if (branch.length === 0) {
			return undefined;
		}

		if (branch.startsWith('(') || branch.startsWith('^')) {
			return undefined;
		}

		if (!branch.endsWith('/') && !branch.endsWith('$')) {
			return undefined;
		}

		result.push(branch);
	}

	return result;
};

export type FreshnessVerdict = {
	stale: boolean;
	missingFromBase: string[];
	comparable: boolean;
};

/**
 * Compares two classifier patterns read from the same workflow file at two
 * different SHAs (PR base vs current develop). Returns `stale: true` and
 * the alternatives present in develop but absent from the base when
 * develop's classifier is a strict superset of the base's.
 *
 * Returns `stale: false` (with no `missingFromBase`) when:
 *   - the two patterns are byte-identical;
 *   - develop's pattern is a strict SUBSET of the base's (the base is
 *     already stricter than develop — a non-issue);
 *   - the two patterns are incomparable (neither is a subset of the
 *     other) — surfaced as `comparable: false` so the caller can choose
 *     to fail loud rather than guess. Incomparable widening is rare in
 *     practice (a maintainer who narrows ORDERS patterns deliberately)
 *     and warrants a human's eyes.
 *
 * `parseClassifierAlternatives(undefined)` returns `undefined` and the
 * caller treats the result as "unable to compare" — the freshness
 * check must never masquerade a parse failure as a green.
 *
 * @param {{
 *   basePattern: unknown,
 *   developPattern: unknown,
 * }} input
 * @returns {{
 *   stale: boolean,
 *   missingFromBase: string[],
 *   comparable: boolean,
 * }}
 */
export const compareClassifierFreshness = ({
	basePattern,
	developPattern,
}: {
	basePattern: unknown;
	developPattern: unknown;
}): FreshnessVerdict => {
	const baseAlternatives = parseClassifierAlternatives(basePattern);
	const developAlternatives = parseClassifierAlternatives(developPattern);

	if (baseAlternatives === undefined || developAlternatives === undefined) {
		return { stale: false, missingFromBase: [], comparable: false };
	}

	const baseSet = new Set(baseAlternatives);
	const developSet = new Set(developAlternatives);
	const missingFromBase = [];

	for (const alternative of developSet) {
		if (!baseSet.has(alternative)) {
			missingFromBase.push(alternative);
		}
	}

	if (missingFromBase.length === 0) {
		return { stale: false, missingFromBase: [], comparable: true };
	}

	// Both patterns parsed AND develop added at least one alternative
	// the base lacks — the comparison was meaningful, the verdict is
	// stale. The CLI still prints a clear cause regardless of whether
	// develop is a strict superset (typical widening) or an
	// incomparable widening (a narrowing happened in the same commit,
	// which is a separate configuration smell warranting a human
	// review alongside the refresh request).
	return {
		stale: true,
		missingFromBase: [...missingFromBase].sort(),
		comparable: true,
	};
};

const toPosixPath = (value: string): string => value.split(path.sep).join('/');

const isDirectRun =
	process.argv[1] &&
	toPosixPath(process.argv[1]).endsWith(
		'packages/scripts-ts/src/check-guard-freshness.ts',
	);

if (isDirectRun) {
	const workflowPath = process.argv[2];

	if (!workflowPath) {
		console.error(
			'Usage: node packages/scripts-ts/src/check-guard-freshness.ts <workflow-path>\n' +
				'(Reads GITHUB_EVENT_NAME, GITHUB_SHA, GH_REPO, PR_BASE_SHA, GH_TOKEN from the environment. Fetches the workflow at <workflow-path> at PR base SHA AND at develop SHA, then runs compareClassifierFreshness on both classifier patterns.)',
		);
		process.exit(1);
	}

	const eventName = process.env.GITHUB_EVENT_NAME ?? '';

	if (eventName !== 'pull_request') {
		console.log(
			`freshness=skipped (event "${eventName}" is not a pull_request; the freshness check only fires on PR events where a stale base matters)`,
		);
		process.exit(0);
	}

	const repo = process.env.GH_REPO;
	const baseSha = process.env.PR_BASE_SHA;

	if (!repo || !baseSha) {
		console.error(
			'GH_REPO and PR_BASE_SHA must be set in the environment for a pull_request event.',
		);
		process.exit(1);
	}

	// The develop SHA is the ref's tip — fetched as a single gh api call
	// per process, and the per-run memoization lives in the script's
	// own $GITHUB_OUTPUT file (the workflow re-runs `changes` only on
	// push and on PR open/synchronize). Refreshing develop on every PR
	// event is the workflow's job, not this script's.
	const developRef = execFileSync(
		'gh',
		['api', `repos/${repo}/git/ref/heads/develop`, '--jq', '.object.sha'],
		{ encoding: 'utf8' },
	)
		.trim()
		.replace(/^sha:/, '');

	const fetchWorkflow = (sha: string): string =>
		execFileSync(
			'gh',
			[
				'api',
				`repos/${repo}/contents/${workflowPath}?ref=${sha}`,
				'--jq',
				'{content: .content, encoding: .encoding}',
			],
			{ encoding: 'utf8' },
		);

	const decode = (raw: string): string => {
		const { content, encoding } = JSON.parse(raw) as {
			content: string;
			encoding: string;
		};
		if (encoding !== 'base64') {
			throw new Error(
				`check-guard-freshness: unexpected content encoding "${encoding}" — the freshness check cannot read this workflow file`,
			);
		}
		return Buffer.from(content, 'base64').toString('utf8');
	};

	const baseRaw = fetchWorkflow(baseSha);
	const developRaw = fetchWorkflow(developRef);

	const baseContent = decode(baseRaw);
	const developContent = decode(developRaw);

	const extractPattern = (text: string): string | undefined => {
		const match = /node "\$CLASSIFIER" '([^']*)'/.exec(text);
		if (match === null) {
			return undefined;
		}
		return match[1];
	};

	const verdict = compareClassifierFreshness({
		basePattern: extractPattern(baseContent),
		developPattern: extractPattern(developContent),
	});

	if (verdict.stale) {
		const developBranch = `develop (${developRef.slice(0, 7)})`;
		const baseRef = `your base (${baseSha.slice(0, 7)})`;
		const missing = verdict.missingFromBase
			.map((path) => `  - ${path}`)
			.join('\n');
		console.error(
			`#1889 stale-base guard: this pull request branches from ${baseRef}, which predates a guard widening on ${developBranch}.\n` +
				`The ${workflowPath} classifier now matches the following paths that the version at your base did NOT:\n${missing}\n` +
				`Refresh your base against develop (rebase or merge) so the CI gate evaluates the same surface on your branch as it will on develop after merge.`,
		);
		const githubOutput = process.env.GITHUB_OUTPUT;
		if (githubOutput) {
			appendFileSync(githubOutput, `stale=true\n`);
		}
		process.exit(1);
	}

	if (!verdict.comparable) {
		// Parse failure or incomparable widening — fail loud rather than
		// certify "not stale" on evidence the script cannot read.
		console.error(
			`#1889 stale-base guard: could not compare the ${workflowPath} classifier between base and develop (one or both patterns did not parse to a list of literal alternatives). Refusing to certify "not stale" — refresh your base manually and re-run.`,
		);
		process.exit(1);
	}

	console.log(
		`#1889 stale-base guard: the ${workflowPath} classifier at ${baseSha.slice(0, 7)} is a superset of (or equal to) the one at ${developRef.slice(0, 7)} — no guard widening to refresh against.`,
	);
	const githubOutput = process.env.GITHUB_OUTPUT;
	if (githubOutput) {
		appendFileSync(githubOutput, `stale=false\n`);
	}
}
