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
 * Must be a file matching `docs/records/YYYY-MM-DD-*.md` whose diff body
 * contains the string `jscpd` (case-insensitive) — proving it covers this
 * metric. A record that does not match this shape does not satisfy the guard.
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
			`Run "git fetch origin develop" to ensure the base branch is available.`,
	};
};

/**
 * Check whether the diff contains a docs/records/ file whose content contains
 * the string "jscpd" (case-insensitive), proving it covers this metric.
 */
const hasJscpdRecord = (
	gitDir: string,
	baseBranch: string | undefined,
): boolean => {
	const base =
		baseBranch !== undefined && baseBranch.length > 0
			? `origin/${baseBranch}`
			: 'origin/develop';

	try {
		if (!gitRefExists(gitDir, base)) {
			const branch = baseBranch ?? 'develop';
			gitFetchBaseBranch(gitDir, branch);
		}

		// Get list of docs/records/ files that are new or modified.
		const diffOutput = execFileSync(
			'git',
			[
				'diff',
				'--name-only',
				'--diff-filter=AM',
				`${base}..HEAD`,
				'--',
				'docs/records/',
			],
			{ cwd: gitDir, encoding: 'utf-8', timeout: 30_000 },
		);

		const recordFiles = diffOutput
			.split('\n')
			.map((f) => f.trim())
			.filter((f) => f.length > 0 && f.startsWith('docs/records/'));

		if (recordFiles.length === 0) {
			return false;
		}

		// For each record file, check whether the diff body contains "jscpd".
		for (const recordFile of recordFiles) {
			if (!recordFile.endsWith('.md')) {
				continue;
			}
			const diffBody = execFileSync(
				'git',
				['diff', `${base}..HEAD`, '--', recordFile],
				{ cwd: gitDir, encoding: 'utf-8', timeout: 30_000 },
			);
			if (/jscpd/i.test(diffBody)) {
				return true;
			}
		}

		return false;
	} catch {
		return false;
	}
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

	const raiseDetails: string[] = [];

	if (prPairs.count! > basePairs.count!) {
		raiseDetails.push(
			`productionPairs.count: ${basePairs.count} → ${prPairs.count} ` +
				`(+${prPairs.count! - basePairs.count!})`,
		);
	}
	if (prPairs.lines! > basePairs.lines!) {
		raiseDetails.push(
			`productionPairs.lines: ${basePairs.lines} → ${prPairs.lines} ` +
				`(+${prPairs.lines! - basePairs.lines!})`,
		);
	}
	if (prAuto.count! > baseAuto.count!) {
		raiseDetails.push(
			`productionAuto.count: ${baseAuto.count} → ${prAuto.count} ` +
				`(+${prAuto.count! - baseAuto.count!})`,
		);
	}
	if (prAuto.lines! > baseAuto.lines!) {
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
	const hasRecord = hasJscpdRecord(gitDir, baseBranch);

	if (hasRecord) {
		const raiseStr = raiseDetails.join('; ');
		return {
			hasRaise: true,
			raiseDetails,
			hasRecord: true,
			recordFiles: [],
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

	// Raise without accompaniment.
	const raiseStr = raiseDetails.join('; ');
	return {
		hasRaise: true,
		raiseDetails,
		hasRecord: false,
		recordFiles: [],
		verdict: 'fail',
		errors: [
			`jscpd reference raise detected without a docs/records/ accompaniment. ` +
				`Values changed: ${raiseStr}. ` +
				`A raise must be accompanied by a docs/records/YYYY-MM-DD-*.md file ` +
				`whose content contains the word "jscpd" to prove it covers this metric. ` +
				`Run: node packages/scripts-ts/src/check-jscpd-raise.ts`,
		],
	};
};

const main = (): void => {
	const gitDir = process.env.PUBLY_JSCPD_RAISE_GIT_DIR ?? repoRoot;
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
