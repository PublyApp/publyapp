/**
 * Production duplication ratchet guard (#1821).
 *
 * WHAT THIS PROVES
 * ----------------
 * After the #1821 ratchet, production-only duplication cannot increase.
 * "Production" means files under apps/api, apps/front/src, packages/shared-ts.
 *
 * Two gated surfaces:
 *   1. Production clone pairs (different files, both in production paths)
 *   2. Production self-duplication (one file duplicated with itself)
 *
 * Spec/test files are excluded from the production-pair gate entirely.
 *
 * THE GUARD FAILS LOUDLY when the jscpd report is absent, empty, or malformed.
 * Never silently substitutes a passing default.
 *
 * BASELINE
 * --------
 * Established with jscpd@4 --min-tokens 50 against this tree, excluding:
 *   node_modules, bin, obj, dist, .artifacts, Migrations, .worktrees.
 * Production paths: apps/api, apps/front/src, packages/shared-ts.
 *
 *   - Production clone pairs (unique, non-spec): 945, 14 367 lines
 *   - Production self-duplication files: 250, 4 782 lines
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const repoRoot = path.resolve(
	path.dirname(new URL(import.meta.url).pathname),
	'../../..',
);

/** Production source path prefixes. */
const PRODUCTION_PATHS = ['apps/api', 'apps/front/src', 'packages/shared-ts'];

/** Spec/test file patterns — excluded from production-pair gate. */
const SPEC_PATTERNS = ['.test.ts', '.test.tsx', '.spec.ts', '.spec.tsx'];

/**
 * Whether a file path is inside a production path prefix.
 */
// @ts-expect-error rung-0
const isProductionPath = (filePath) => {
	for (const prefix of PRODUCTION_PATHS) {
		if (filePath.startsWith(prefix + '/') || filePath === prefix) {
			return true;
		}
	}
	return false;
};

/**
 * Whether a file is a spec or test file.
 */
// @ts-expect-error rung-0
const isSpecFile = (filePath) => {
	for (const pat of SPEC_PATTERNS) {
		if (filePath.includes(pat)) return true;
	}
	return false;
};

/**
 * Whether two files are the same path (self-duplication).
 */
// @ts-expect-error rung-0
const isSelfClone = (f0, f1) => f0 === f1;

/**
 * jscpd@4 report shape (the JSON key for clone entries is "duplicates",
 * not "statistics.clones").
 */
// @ts-expect-error rung-0
const readReport = (reportPath) => {
	if (!fs.existsSync(reportPath)) {
		return {
			ok: false,
			error: `Report not found: ${reportPath}. Run jscpd first.`,
		};
	}

	let content;
	try {
		content = fs.readFileSync(reportPath, 'utf-8');
	} catch (e) {
		return { ok: false, error: `Cannot read report: ${e}` };
	}

	let data;
	try {
		data = JSON.parse(content);
	} catch (e) {
		return { ok: false, error: `Malformed JSON: ${e}` };
	}

	if (!data.statistics || !Array.isArray(data.duplicates)) {
		return {
			ok: false,
			error:
				'Report missing "statistics" or "duplicates" field. ' +
				'Ensure jscpd was run with --reporters json.',
		};
	}

	return { ok: true, data };
};

/**
 * Reference values file.
 */
// @ts-expect-error rung-0
const readReference = (refPath) => {
	if (!fs.existsSync(refPath)) {
		return {
			ok: false,
			error: `Reference not found: ${refPath}`,
		};
	}

	let content;
	try {
		content = fs.readFileSync(refPath, 'utf-8');
	} catch (e) {
		return { ok: false, error: `Cannot read reference: ${e}` };
	}

	let data;
	try {
		data = JSON.parse(content);
	} catch (e) {
		return { ok: false, error: `Malformed reference JSON: ${e}` };
	}

	return { ok: true, data };
};

/**
 * Computes production duplication statistics from the jscpd report.
 *
 * - productionPairs: unique (a,b) pairs where both files are production and neither
 *   is a spec/test file. Self-clones are excluded.
 * - productionAuto: unique files that are production and self-duplicated.
 */
// @ts-expect-error rung-0
export const computeProductionStats = (dupes) => {
	const uniquePairs = new Map();
	const uniqueAuto = new Map();

	for (const dupe of dupes) {
		const f0 = dupe.firstFile?.name ?? '';
		const f1 = dupe.secondFile?.name ?? '';
		const lines = dupe.lines ?? 0;

		if (!f0 || !f1) continue;

		if (isSelfClone(f0, f1)) {
			if (isProductionPath(f0)) {
				// Track the maximum duplicate-lines value for this file.
				const prev = uniqueAuto.get(f0) ?? 0;
				if (lines > prev) uniqueAuto.set(f0, lines);
			}
		} else {
			const p0 = isProductionPath(f0);
			const p1 = isProductionPath(f1);
			const s0 = isSpecFile(f0);
			const s1 = isSpecFile(f1);

			if (p0 && p1 && !s0 && !s1) {
				// Canonical key so (a,b) and (b,a) are the same pair.
				const key = f0 < f1 ? `${f0}|${f1}` : `${f1}|${f0}`;
				if (!uniquePairs.has(key)) {
					uniquePairs.set(key, lines);
				}
			}
		}
	}

	let pairLines = 0;
	for (const l of uniquePairs.values()) pairLines += l;

	let autoLines = 0;
	for (const l of uniqueAuto.values()) autoLines += l;

	return {
		pairCount: uniquePairs.size,
		pairLines,
		autoCount: uniqueAuto.size,
		autoLines,
	};
};

/**
 * Main guard logic. Returns an array of error messages — empty means pass.
 */
// @ts-expect-error rung-0
export const verifyJscpdRatchet = (reportPath_, refPath_) => {
	const reportPath =
		reportPath_ ??
		path.resolve(repoRoot, '.dump/jscpd-report.json/jscpd-report.json');
	const refPath =
		refPath_ ??
		path.resolve(repoRoot, 'packages/scripts-ts/src/jscpd-reference.json');
	const errors = [];

	const reportResult = readReport(reportPath);
	if (!reportResult.ok) {
		return [`jscpd report unavailable: ${reportResult.error}`];
	}

	const refResult = readReference(refPath);
	if (!refResult.ok) {
		return [`jscpd reference file unavailable: ${refResult.error}`];
	}

	const ref = refResult.data;
	const report = reportResult.data;

	// jscpd@4 places clone entries in the "duplicates" array.
	const dupes = report.duplicates ?? [];
	const stats = computeProductionStats(dupes);

	// --- Production pairs: strict ratchet ---

	const refPairs = ref.productionPairs ?? { count: 0, lines: 0 };

	if (stats.pairCount > refPairs.count) {
		errors.push(
			`Production clone pairs increased from ${refPairs.count} to ${stats.pairCount} ` +
				`(+${stats.pairCount - refPairs.count}). Merge duplicate logic or extract shared utilities.`,
		);
	}

	if (stats.pairLines > refPairs.lines) {
		errors.push(
			`Production duplicate lines increased from ${refPairs.lines} to ${stats.pairLines} ` +
				`(+${stats.pairLines - refPairs.lines}). Remove or deduplicate the copied code.`,
		);
	}

	// --- Production self-duplication: strict ratchet ---

	const refAuto = ref.productionAuto ?? { count: 0, lines: 0 };

	if (stats.autoCount > refAuto.count) {
		errors.push(
			`Production self-duplication files increased from ${refAuto.count} to ${stats.autoCount} ` +
				`(+${stats.autoCount - refAuto.count}). Refactor this file to remove internal duplication.`,
		);
	}

	if (stats.autoLines > refAuto.lines) {
		errors.push(
			`Production self-duplication lines increased from ${refAuto.lines} to ${stats.autoLines} ` +
				`(+${stats.autoLines - refAuto.lines}). Reduce the duplicated lines in this file.`,
		);
	}

	// --- Anti-rot: empty scan is suspicious ---

	const totalClones = report.statistics?.total?.clones ?? 0;
	if (totalClones === 0 && dupes.length === 0) {
		errors.push(
			`jscpd reported 0 clones — the scan may have run against an empty or misconfigured tree. ` +
				`Verify the report at ${reportPath} is real.`,
		);
	}

	return errors;
};

/**
 * CLI entry point.
 */
// @ts-expect-error rung-0
const main = () => {
	const reportPath =
		process.argv[2] ??
		path.resolve(repoRoot, '.dump/jscpd-report.json/jscpd-report.json');
	const refPath =
		process.argv[3] ??
		path.resolve(repoRoot, 'packages/scripts-ts/src/jscpd-reference.json');

	const errors = verifyJscpdRatchet(reportPath, refPath);

	if (errors.length > 0) {
		console.error('jscpd ratchet violations:');
		for (const e of errors) {
			console.error('  ' + e);
		}
		console.error('');
		console.error('FAILED: production duplication has increased.');
		console.error('Fix the duplication, then re-run jscpd and this guard.');
		process.exit(1);
	}

	console.log('PASSED: production duplication is within baseline.');
	process.exit(0);
};

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
	main();
}
