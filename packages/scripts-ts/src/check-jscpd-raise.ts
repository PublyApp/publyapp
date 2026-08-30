/**
 * Production duplication ratchet raise guard — issue #1969.
 *
 * WHAT THIS PROVES
 * ----------------
 * The main jscpd ratchet guard (`check-jscpd.ts`) measures the working tree
 * against the MERGE BASE reference (#1890 anchor). A PR that raises the
 * reference is therefore necessarily RED on quality/quality-gate — by design.
 *
 * This separate guard handles the RAISE case provably:
 *
 *   - Reads the committed reference from the PR's own tree (the raised one).
 *   - Reads the base reference from the merge base (via `git show`).
 *   - If the PR reference has HIGHER values than the base, a raise is present.
 *   - A raise MUST be accompanied by a `docs/records/` file in the diff that
 *     names the surface that moved the metric.
 *   - Raise + accompaniment -> PASS (separate verdict, does not green the main
 *     guard; the human reviewer approves and merge-approves the PR).
 *   - Raise + NO accompaniment -> FAIL loudly, naming what is missing.
 *   - No raise -> exit 0 silently (the main ratchet handles it).
 *
 * WHY THIS SHAPE (option 3 of three weighed in #1969)
 * ---------------------------------------------------
 * Option 1 (guard reads PR reference when a record is present) and option 2
 * (two-step protocol with SHA ancestry) both risk reopening the #1890 bypass:
 * any code path that reads the PR's own tree to adjust the ratchet opens a
 * hole where a PR could raise the reference AND add a fake record in the same
 * diff, getting green without a real review.
 *
 * Option 3 keeps the main ratchet anchor exactly as #1890 left it (always the
 * base, never the PR tree). The raise is handled by a separate job that:
 *   (a) produces its own PASS/FAIL verdict, so the main gate is never modified
 *       by code that lives in the PR tree;
 *   (b) makes the raise VISIBLE as its own decision rather than a red that
 *       someone waves through;
 *   (c) proves accompaniment with a committed, reviewable `docs/records/`
 *       artifact that names the surface.
 *
 * THE ACCOMPANIMENT RECORD
 * ------------------------
 * Must be a file matching `docs/records/YYYY-MM-DD-*.md` whose added diff lines
 * contain the RAISED KEY NAMES (e.g. `productionPairs.count`) — proving the
 * author identified which metric moved. A record that does not name the raised
 * keys does not satisfy the guard. The check is key-NAME presence only: it does
 * not parse or compare the before/after numbers (a reviewer catches false numbers).
 *
 * MUTATIONS THAT STAY RED
 * ------------------------
 * The main ratchet stays green: raising jscpd-reference.json alone (without
 * a matching docs/records/ file) is caught by this guard and makes the PR
 * red on the `ratchet-raise` job. The #1890 attack (raise + real duplication
 * in the same commit) is caught by the main ratchet measuring the base.
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const repoRoot = path.resolve(
	path.dirname(new URL(import.meta.url).pathname),
	'../../..',
);

const REFERENCE_RELATIVE_PATH = 'packages/scripts-ts/src/jscpd-reference.json';

/** jscpd reference shape (subset). */
interface ReferenceValues {
	productionPairs?: { count?: number; lines?: number };
	productionAuto?: { count?: number; lines?: number };
}

interface ReadResult<T> {
	ok: boolean;
	error?: string;
	data?: T;
}

const readJsonFile = <T>(filePath: string): ReadResult<T> => {
	if (!fs.existsSync(filePath)) {
		return { ok: false, error: `File not found: ${filePath}` };
	}
	try {
		const content = fs.readFileSync(filePath, 'utf-8');
		const data = JSON.parse(content) as T;
		return { ok: true, data };
	} catch (e) {
		return {
			ok: false,
			error: `Cannot read or parse ${filePath}: ${String(e)}`,
		};
	}
};

const gitError = (e: unknown): string => {
	const err = e as { stderr?: string | Buffer; message?: string };
	if (err.stderr !== undefined && String(err.stderr).trim().length > 0) {
		return String(err.stderr).trim();
	}
	return String(e);
};

const gitShowBlob = (gitDir: string, ref: string, relPath: string): string =>
	execFileSync('git', ['show', `${ref}:${relPath}`], {
		cwd: gitDir,
		encoding: 'utf-8',
		timeout: 30_000,
	});

const gitRefExists = (gitDir: string, ref: string): boolean => {
	try {
		execFileSync('git', ['rev-parse', '--verify', '--quiet', ref], {
			cwd: gitDir,
			encoding: 'utf-8',
			timeout: 30_000,
		});
		return true;
	} catch {
		return false;
	}
};

const gitFetchBaseBranch = (gitDir: string, branch: string): string => {
	try {
		execFileSync('git', ['fetch', '--depth', '1', 'origin', branch], {
			cwd: gitDir,
			encoding: 'utf-8',
			timeout: 120_000,
		});
		return '';
	} catch (e) {
		return gitError(e);
	}
};

/** Read the base reference from the merge base. */
const readBaseReference = (
	gitDir: string,
	baseBranch: string | undefined,
): ReadResult<ReferenceValues> => {
	const candidates =
		baseBranch !== undefined && baseBranch.length > 0
			? [`refs/remotes/origin/${baseBranch}`, baseBranch]
			: ['refs/remotes/origin/develop', 'develop'];

	for (const candidate of candidates) {
		if (!gitRefExists(gitDir, candidate)) {
			const branch = candidate.replace(/^refs\/remotes\/origin\//, '');
			gitFetchBaseBranch(gitDir, branch);
			if (!gitRefExists(gitDir, candidate)) {
				continue;
			}
		}
		try {
			const blob = gitShowBlob(gitDir, candidate, REFERENCE_RELATIVE_PATH);
			const data = JSON.parse(blob) as ReferenceValues;
			return { ok: true, data };
		} catch {
			continue;
		}
	}

	return {
		ok: false,
		error:
			`Could not read base reference from any candidate: ${candidates.join(', ')}. ` +
			`Run "git fetch origin ${baseBranch ?? 'develop'}" to ensure the base branch is available.`,
	};
};

/**
 * Result of checking for a docs/records/ accompaniment.
 * - hasRecord=true: a qualifying record was found.
 * - error: the check could not run (distinct from "no record found").
 * - skippedFiles: docs/records/ files that were rejected and why.
 */
interface JscpdRecordResult {
	hasRecord: boolean;
	recordFiles: string[];
	error?: string;
	skippedFiles: { file: string; reason: string }[];
}

/**
 * Check whether the diff contains a docs/records/ file whose content names the
 * specific metric keys that raised, proving the author looked at the actual numbers.
 *
 * The three-dot form (`mergeBase...HEAD`) excludes any changes that exist on `base`
 * alone — a docs/records/ change made by develop after the fork point would not
 * appear in this diff and would not be credited to this PR.
 *
 * The merge base MUST exist. If `git merge-base` fails, the guard cannot determine
 * its own scope and fails loud rather than substituting a vulnerable two-dot diff.
 * A shallow checkout (default fetch-depth: 1) leaves HEAD with no common ancestor
 * with the base — the fix is `fetch-depth: 0` on the job's checkout.
 */
const hasJscpdRecord = (
	gitDir: string,
	baseBranch: string | undefined,
	raisedKeys: string[],
): JscpdRecordResult => {
	const base =
		baseBranch !== undefined && baseBranch.length > 0
			? `origin/${baseBranch}`
			: 'origin/develop';

	if (!gitRefExists(gitDir, base)) {
		const branch = baseBranch ?? 'develop';
		gitFetchBaseBranch(gitDir, branch);
	}

	// The merge base MUST exist. Three dots require a common ancestor; without
	// one the diff scope is undefined and the guard cannot run correctly.
	try {
		execFileSync('git', ['merge-base', base, 'HEAD'], {
			cwd: gitDir,
			encoding: 'utf-8',
			timeout: 10_000,
		});
	} catch (e) {
		return {
			hasRecord: false,
			recordFiles: [],
			error:
				`Cannot compute merge base between ${base} and HEAD. ` +
				`The checkout has no common ancestor with ${base}; ` +
				`the job's checkout needs fetch-depth: 0. ` +
				`Original error: ${gitError(e)}`,
			skippedFiles: [],
		};
	}

	// Get list of docs/records/ files that are new or modified.
	let diffOutput: string;
	try {
		diffOutput = execFileSync(
			'git',
			[
				'diff',
				'--name-only',
				'--diff-filter=AM',
				`${base}...HEAD`,
				'--',
				'docs/records/',
			],
			{ cwd: gitDir, encoding: 'utf-8', timeout: 30_000 },
		);
	} catch (e) {
		return {
			hasRecord: false,
			recordFiles: [],
			error: `Failed to diff docs/records/ (${base}...HEAD): ${gitError(e)}`,
			skippedFiles: [],
		};
	}

	const recordFiles = diffOutput
		.split('\n')
		.map((f) => f.trim())
		.filter((f) => f.length > 0 && f.startsWith('docs/records/'));

	if (recordFiles.length === 0) {
		return { hasRecord: false, recordFiles: [], skippedFiles: [] };
	}

	// The record must name the specific raised keys to prove the author looked.
	const skippedFiles: { file: string; reason: string }[] = [];
	for (const recordFile of recordFiles) {
		if (!recordFile.endsWith('.md')) {
			skippedFiles.push({ file: recordFile, reason: 'not a .md file' });
			continue;
		}
		// Validate date format: YYYY-MM-DD-*.md
		const datePattern = /^docs\/records\/\d{4}-\d{2}-\d{2}-.+\.md$/;
		if (!datePattern.test(recordFile)) {
			skippedFiles.push({
				file: recordFile,
				reason: 'name must match docs/records/YYYY-MM-DD-*.md',
			});
			continue;
		}
		const diffBody = execFileSync(
			'git',
			['diff', `${base}...HEAD`, '--', recordFile],
			{ cwd: gitDir, encoding: 'utf-8', timeout: 30_000 },
		);
		if (recordMentionsRaise(diffBody, raisedKeys)) {
			return { hasRecord: true, recordFiles, skippedFiles };
		}
	}

	return { hasRecord: false, recordFiles, skippedFiles };
};

/**
 * Check whether the diff body names the raised metric keys in the added content.
 * The record must contain each raised key name (e.g. `productionPairs.count`)
 * in its added lines. This is a key-NAME presence check only — it does not parse
 * or compare before/after numbers (a reviewer catches false numbers).
 */
const recordMentionsRaise = (
	diffBody: string,
	raisedKeys: string[],
): boolean => {
	// The diff body contains + (additions) and - (deletions) lines.
	// We need the ADDED content (what the author wrote), not the removed.
	const addedLines = diffBody
		.split('\n')
		.filter((line) => line.startsWith('+') && !line.startsWith('+++'));
	const addedText = addedLines.join('\n');

	// Check each raised key: the record must contain the key name.
	for (const key of raisedKeys) {
		const keyRegex = new RegExp(key.replace('.', '\\.'), 'i');
		if (!keyRegex.test(addedText)) {
			return false;
		}
	}
	return true;
};

/** Raise verdict — null means no raise detected (caller exits 0). */
export interface RaiseVerdict {
	hasRaise: boolean;
	raiseDetails: string[];
	hasRecord: boolean;
	recordFiles: string[];
	verdict: 'pass' | 'fail' | 'none';
	errors: string[];
	passMessage?: string;
}

/**
 * Main guard: determines whether a jscpd reference raise is provably accompanied
 * by a docs/records/ change that covers the jscpd metric.
 */
export const verifyJscpdRaise = (
	gitDir: string = repoRoot,
	baseBranch?: string,
): RaiseVerdict => {
	// Read the PR's committed reference (the potentially raised one).
	const prRefPath = path.join(gitDir, REFERENCE_RELATIVE_PATH);
	const prRefResult = readJsonFile<ReferenceValues>(prRefPath);
	if (!prRefResult.ok || prRefResult.data === undefined) {
		return {
			hasRaise: false,
			raiseDetails: [],
			hasRecord: false,
			recordFiles: [],
			verdict: 'fail',
			errors: [
				`Cannot read PR reference at ${prRefPath}: ${prRefResult.error ?? 'unknown'}. ` +
					`A raise guard requires the PR's reference file to be present.`,
			],
		};
	}
	const prRef = prRefResult.data;

	// Read the base reference.
	const baseRefResult = readBaseReference(gitDir, baseBranch);
	if (!baseRefResult.ok || baseRefResult.data === undefined) {
		return {
			hasRaise: false,
			raiseDetails: [],
			hasRecord: false,
			recordFiles: [],
			verdict: 'fail',
			errors: [
				`Cannot read base reference: ${baseRefResult.error ?? 'unknown'}. ` +
					`A raise guard requires the base reference to be available.`,
			],
		};
	}
	const baseRef = baseRefResult.data;

	// Extract aggregate values.
	const basePairs = baseRef.productionPairs ?? { count: 0, lines: 0 };
	const prPairs = prRef.productionPairs ?? { count: 0, lines: 0 };
	const baseAuto = baseRef.productionAuto ?? { count: 0, lines: 0 };
	const prAuto = prRef.productionAuto ?? { count: 0, lines: 0 };

	// Fail loudly when the base reference is missing a metric key that the PR raised.
	// A missing key is an unanalysable reference — the brief requires a loud failure.
	const baseMissingKeys: string[] = [];
	if (
		prRef.productionPairs !== undefined &&
		baseRef.productionPairs === undefined
	) {
		baseMissingKeys.push('productionPairs');
	}
	if (
		prRef.productionAuto !== undefined &&
		baseRef.productionAuto === undefined
	) {
		baseMissingKeys.push('productionAuto');
	}
	if (baseMissingKeys.length > 0) {
		return {
			hasRaise: false,
			raiseDetails: [],
			hasRecord: false,
			recordFiles: [],
			verdict: 'fail',
			errors: [
				`Base reference is missing metric keys that the PR defines: ${baseMissingKeys.join(', ')}. ` +
					`A raise guard requires both the base and the PR reference to define the same keys. ` +
					`Run "git fetch origin ${baseBranch ?? 'develop'}" to ensure the base branch is available.`,
			],
		};
	}

	// Fail loudly when the base reference is missing an INNER metric key (count/lines)
	// that the PR defines. A missing inner key makes the comparison undefined > undefined →
	// false → silent exit 0, which is an unanalysable reference and must fail loud.
	const baseMissingInnerKeys: string[] = [];
	if (
		prRef.productionPairs !== undefined &&
		baseRef.productionPairs !== undefined
	) {
		if (
			prRef.productionPairs.count !== undefined &&
			baseRef.productionPairs.count === undefined
		) {
			baseMissingInnerKeys.push('productionPairs.count');
		}
		if (
			prRef.productionPairs.lines !== undefined &&
			baseRef.productionPairs.lines === undefined
		) {
			baseMissingInnerKeys.push('productionPairs.lines');
		}
	}
	if (
		prRef.productionAuto !== undefined &&
		baseRef.productionAuto !== undefined
	) {
		if (
			prRef.productionAuto.count !== undefined &&
			baseRef.productionAuto.count === undefined
		) {
			baseMissingInnerKeys.push('productionAuto.count');
		}
		if (
			prRef.productionAuto.lines !== undefined &&
			baseRef.productionAuto.lines === undefined
		) {
			baseMissingInnerKeys.push('productionAuto.lines');
		}
	}
	if (baseMissingInnerKeys.length > 0) {
		return {
			hasRaise: false,
			raiseDetails: [],
			hasRecord: false,
			recordFiles: [],
			verdict: 'fail',
			errors: [
				`Base reference is missing metric sub-keys that the PR defines: ${baseMissingInnerKeys.join(', ')}. ` +
					`A raise guard requires both the base and the PR reference to define the same sub-keys ` +
					`(each of count/lines must be present in both references for any metric that appears in both). ` +
					`Run "git fetch origin ${baseBranch ?? 'develop'}" to ensure the base branch is available.`,
			],
		};
	}

	const raiseDetails: string[] = [];
	const raisedKeys: string[] = [];

	if (prPairs.count! > basePairs.count!) {
		raisedKeys.push('productionPairs.count');
		raiseDetails.push(
			`productionPairs.count: ${basePairs.count} → ${prPairs.count} ` +
				`(+${prPairs.count! - basePairs.count!})`,
		);
	}
	if (prPairs.lines! > basePairs.lines!) {
		raisedKeys.push('productionPairs.lines');
		raiseDetails.push(
			`productionPairs.lines: ${basePairs.lines} → ${prPairs.lines} ` +
				`(+${prPairs.lines! - basePairs.lines!})`,
		);
	}
	if (prAuto.count! > baseAuto.count!) {
		raisedKeys.push('productionAuto.count');
		raiseDetails.push(
			`productionAuto.count: ${baseAuto.count} → ${prAuto.count} ` +
				`(+${prAuto.count! - baseAuto.count!})`,
		);
	}
	if (prAuto.lines! > baseAuto.lines!) {
		raisedKeys.push('productionAuto.lines');
		raiseDetails.push(
			`productionAuto.lines: ${baseAuto.lines} → ${prAuto.lines} ` +
				`(+${prAuto.lines! - baseAuto.lines!})`,
		);
	}

	const hasRaise = raiseDetails.length > 0;

	if (!hasRaise) {
		return {
			hasRaise: false,
			raiseDetails: [],
			hasRecord: false,
			recordFiles: [],
			verdict: 'none',
			errors: [],
		};
	}

	// Raise detected. Check for accompaniment record.
	const recordResult = hasJscpdRecord(gitDir, baseBranch, raisedKeys);

	// hasJscpdRecord could not run (e.g. merge base unfindable). Fail loud
	// distinguishing "check failed" from "no record found".
	if (recordResult.error !== undefined) {
		return {
			hasRaise: true,
			raiseDetails,
			hasRecord: false,
			recordFiles: recordResult.recordFiles,
			verdict: 'fail',
			errors: [
				`jscpd reference raise detected, but the accompaniment check could not run. ` +
					`Reason: ${recordResult.error}`,
			],
		};
	}

	if (recordResult.hasRecord) {
		const raiseStr = raiseDetails.join('; ');
		return {
			hasRaise: true,
			raiseDetails,
			hasRecord: true,
			recordFiles: recordResult.recordFiles,
			verdict: 'pass',
			errors: [],
			passMessage:
				`jscpd reference raise detected and accompanied by a docs/records/ change ` +
				`that covers the jscpd metric. ` +
				`Values changed: ${raiseStr}. ` +
				`This job reports separately from the main ratchet guard; ` +
				`the reviewer approves the raise and merge-approves the PR.`,
		};
	}

	// Raise without accompaniment. Name the record files we rejected (if any).
	const raiseStr = raiseDetails.join('; ');
	const skippedInfo =
		recordResult.skippedFiles.length > 0
			? ' Rejected files: ' +
				recordResult.skippedFiles
					.map((s) => `${s.file} (${s.reason})`)
					.join('; ') +
				'.'
			: '';
	return {
		hasRaise: true,
		raiseDetails,
		hasRecord: false,
		recordFiles: recordResult.recordFiles,
		verdict: 'fail',
		errors: [
			`jscpd reference raise detected without a docs/records/ accompaniment. ` +
				`Values changed: ${raiseStr}.` +
				skippedInfo +
				` A raise must be accompanied by a docs/records/YYYY-MM-DD-*.md file ` +
				`that names the raised keys (${raisedKeys.join(', ')}) in its content. ` +
				`Write the key names with their before/after values, e.g.: ` +
				`"productionPairs.count: ${basePairs.count} → ${prPairs.count}". ` +
				`Run: node packages/scripts-ts/src/check-jscpd-raise.ts`,
		],
	};
};

const main = (): void => {
	const gitDir = process.env.PUBLY_JSCPD_RAISE_GIT_DIR ?? repoRoot;

	// PUBLY_JSCPD_BASE_REF has a dual-use convention inherited from its original
	// purpose as a git directory override:
	//   - If its value is an EXISTING FILE PATH, it is treated as PUBLY_JSCPD_RAISE_GIT_DIR
	//     (an alternate working tree) and NOT used as a branch name.
	//   - If its value is NOT an existing path (e.g. "develop"), it is used as the base
	//     branch name for the comparison.
	// This inversion is intentional: the env var was originally the git-dir override,
	// and adding a separate branch-name meaning without a separate variable name
	// preserves backward compatibility. GITHUB_BASE_REF takes precedence.
	const baseBranch =
		process.env.GITHUB_BASE_REF ??
		(process.env.PUBLY_JSCPD_BASE_REF !== undefined &&
		!fs.existsSync(process.env.PUBLY_JSCPD_BASE_REF)
			? process.env.PUBLY_JSCPD_BASE_REF
			: undefined);

	const verdict = verifyJscpdRaise(gitDir, baseBranch);

	if (verdict.verdict === 'none') {
		// No raise — nothing to do, exit silently.
		process.exit(0);
	}

	if (verdict.verdict === 'pass') {
		console.log(
			'PASSED: jscpd reference raise is accompanied by a docs/records/ file.',
		);
		console.log(verdict.passMessage);
		process.exit(0);
	}

	// verdict === 'fail'
	for (const e of verdict.errors) {
		console.error('jscpd ratchet raise guard FAILED:');
		console.error('  ' + e);
	}
	process.exit(1);
};

if (
	process.argv[1] !== undefined &&
	import.meta.url === pathToFileURL(process.argv[1]).href
) {
	main();
}
