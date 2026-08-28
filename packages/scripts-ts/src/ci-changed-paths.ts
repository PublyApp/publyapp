import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

// Changed-path classifier for the #1017 aggregate CI gates (front-e2e.yml,
// front-ci.yml, openapi-spec-drift.yml, docs-archive.yml). Each workflow's
// cheap `changes` job shells out to this script instead of inlining the
// logic, so the decision that controls whether the heavy jobs run is a real,
// unit-tested function rather than untested bash embedded in YAML.
//
// THE FAILURE MODE THIS EXISTS TO CLOSE
// --------------------------------------
// GitHub's "List pull request files" endpoint returns at most 3,000 entries,
// full stop — `gh api --paginate` follows every page GitHub offers, but it
// cannot make the endpoint hand back a 3,001st file. A pull request above
// that ceiling gets a VALID, SUCCESSFUL, TRUNCATED response. If a relevant
// file sits outside the returned set, naive pattern matching finds nothing,
// reports "not relevant", the heavy job is skipped, and the aggregate gate
// (which correctly treats "skipped" as a pass) reports green — a required
// check certifying nothing.
//
// classifyRelevance() closes that hole by comparing the fetched file count
// against the pull request's own reported `changed_files` total. Any
// mismatch — truncation, an empty response, a non-numeric total — means the
// complete list cannot be established, and the classifier fails closed by
// reporting the workflow relevant (run everything) rather than guessing.

/**
 * Pure decision function: given a pull request event's changed-file
 * evidence and this workflow's relevance pattern, decides whether the heavy
 * jobs should run.
 *
 * @param {{
 *   eventName: string,
 *   files: unknown,
 *   changedFilesTotal: unknown,
 *   pattern: string,
 * }} input
 * @returns {{ relevant: boolean, reason: string }}
 */
export const classifyRelevance = ({
	// @ts-expect-error rung-0: add proper type in later rung
	eventName,
	// @ts-expect-error rung-0: add proper type in later rung
	files,
	// @ts-expect-error rung-0: add proper type in later rung
	changedFilesTotal,
	// @ts-expect-error rung-0: add proper type in later rung
	pattern,
}) => {
	if (eventName === 'merge_group') {
		return {
			relevant: true,
			// A merge_group event evaluates a merge-queue entry, not an open
			// pull request: GitHub does not expose a per-file diff for it (no
			// `pull_request.number` to list files against), so there is nothing
			// this classifier could pattern-match. Almost certainly correct to
			// run everything rather than guess: a merge-queue entry is, by
			// definition, about to be merged, so treating it as relevant by
			// construction fails closed the same way an unverifiable pull
			// request diff already does below.
			reason:
				'merge_group event: there is no per-file diff to evaluate for a merge-queue entry (GitHub exposes no pull-request file list for this event), so the workflow is treated as relevant by construction rather than guessed at',
		};
	}

	if (eventName !== 'pull_request') {
		return {
			relevant: true,
			reason:
				'non-pull_request event (e.g. push); push runs are already path-filtered at the trigger, so a push that starts this workflow is relevant by construction',
		};
	}

	if (!Array.isArray(files)) {
		return {
			relevant: true,
			reason:
				'changed-file list is not an array (missing or malformed API response); the complete list cannot be established, so failing closed by running everything',
		};
	}

	if (
		typeof changedFilesTotal !== 'number' ||
		!Number.isFinite(changedFilesTotal) ||
		changedFilesTotal < 0
	) {
		return {
			relevant: true,
			reason:
				"the pull request's reported changed_files total is missing or not a valid non-negative number; completeness cannot be verified, so failing closed by running everything",
		};
	}

	if (files.length !== changedFilesTotal) {
		return {
			relevant: true,
			reason: `fetched ${files.length} changed file(s) but the pull request reports ${changedFilesTotal} — the list is incomplete (this is exactly what GitHub's 3,000-file "List pull request files" ceiling produces), so failing closed by running everything`,
		};
	}

	const regex = new RegExp(pattern);
	const matched = files.some((file) => regex.test(file));

	return {
		relevant: matched,
		reason: matched
			? 'at least one changed file matched the relevant path groups'
			: 'the complete changed-file list was verified (fetched count matches the PR total) and no file matched the relevant path groups',
	};
};

/**
 * Strictly parses `gh api ... --jq '.changed_files'` raw stdout into a
 * non-negative integer, or `undefined` when the value cannot be trusted.
 *
 * This is the exact boundary a round-2 review found broken: `gh --jq` on a
 * missing property (or literal `null`) exits 0 with EMPTY stdout, and naive
 * `Number('')` evaluates to `0` — a fabricated, valid-looking total that
 * would make `classifyRelevance()` believe a truncated or missing signal was
 * a genuinely empty PR. Only a string matching `^\d+$` (no sign, no
 * decimal, no exponent, not empty, not "null") is trusted; anything else
 * returns `undefined`, which `classifyRelevance()` already treats as
 * "completeness cannot be verified" and fails closed to relevant=true.
 *
 * @param {string} raw
 * @returns {number | undefined}
 */
// @ts-expect-error rung-0: add proper type in later rung
export const parseChangedFilesTotal = (raw) => {
	const trimmed = String(raw).trim();

	if (!/^\d+$/.test(trimmed)) {
		return undefined;
	}

	const value = Number(trimmed);

	if (Number.isSafeInteger(value)) {
		return value;
	}
	return undefined;
};

// @ts-expect-error rung-0: add proper type in later rung
const toPosixPath = (value) => value.split(path.sep).join('/');

const isDirectRun =
	process.argv[1] &&
	toPosixPath(process.argv[1]).endsWith(
		'packages/scripts-ts/src/ci-changed-paths.ts',
	);

if (isDirectRun) {
	const pattern = process.argv[2];

	if (!pattern) {
		console.error(
			'Usage: node scripts/ci-changed-paths.mjs <regex-pattern>\n' +
				'(Reads GITHUB_EVENT_NAME, GH_REPO, PR_NUMBER, GH_TOKEN from the environment.)',
		);
		process.exit(1);
	}

	const eventName = process.env.GITHUB_EVENT_NAME ?? '';

	// @ts-expect-error rung-0: TS7034
	let files = [];
	// undefined (not 0) by default: absent evidence must read as "unverified",
	// never as a fabricated zero. classifyRelevance() already fails closed on
	// a non-number changedFilesTotal.
	let changedFilesTotal;

	if (eventName === 'pull_request') {
		const repo = process.env.GH_REPO;
		const prNumber = process.env.PR_NUMBER;

		if (!repo || !prNumber) {
			throw new Error(
				'GH_REPO and PR_NUMBER must be set in the environment for a pull_request event.',
			);
		}

		// Two independent signals: the PR's own idea of how many files changed
		// (from the PR resource itself, not the paginated files list), and the
		// actual enumerated list. Disagreement between them is the truncation
		// signal classifyRelevance() checks for.
		//
		// `gh api --jq` on a missing property (or a literal `null`) exits 0
		// with EMPTY stdout — parseChangedFilesTotal() is the strict boundary
		// that keeps that from becoming a fabricated `0` via blind `Number()`.
		const changedFilesTotalRaw = execFileSync(
			'gh',
			['api', `repos/${repo}/pulls/${prNumber}`, '--jq', '.changed_files'],
			{ encoding: 'utf8' },
		);
		changedFilesTotal = parseChangedFilesTotal(changedFilesTotalRaw);

		const filesOutput = execFileSync(
			'gh',
			[
				'api',
				'--paginate',
				`repos/${repo}/pulls/${prNumber}/files`,
				'--jq',
				'.[].filename',
			],
			{ encoding: 'utf8' },
		);

		files = filesOutput
			.split('\n')
			.map((line) => line.trim())
			.filter((line) => line.length > 0);
	}

	const { relevant, reason } = classifyRelevance({
		eventName,
		// @ts-expect-error rung-0: TS7005
		files,
		changedFilesTotal,
		pattern,
	});

	console.log(`relevant=${relevant} (${reason})`);

	const githubOutput = process.env.GITHUB_OUTPUT;

	if (githubOutput) {
		appendFileSync(githubOutput, `relevant=${relevant}\n`);
	}
}
