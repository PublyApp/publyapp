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
 * Spec/test/generated files (TS `.test.*`/`.spec.*`, C# `*.Spec.cs` /
 * `*.Tests.cs` / `*.g.cs`, plus test-directory patterns) are excluded from
 * BOTH gated surfaces. Their duplication is REPORTED on every run but never
 * blocks (issue #1821 requirement 2).
 *
 * Every jscpd clone fragment between two production files counts: when an
 * already-paired pair gains one more identical block, its lines add to the
 * pair total. A "first fragment wins" count made that growth invisible —
 * the exact accumulation pattern the issue targets (Update* handler
 * families, copied error-view files).
 *
 * THE GUARD FAILS LOUDLY when the jscpd report is absent, empty, or malformed.
 * Never silently substitutes a passing default.
 *
 * BASELINE
 * -------
 * Established with jscpd@4 --min-tokens 50 against this tree, excluding:
 *   node_modules, bin, obj, dist, .artifacts, Migrations, .worktrees,
 *   packages/client-ts, apps/front/scripts.
 * The exclusion list is a SINGLE comma-separated `--ignore` value: jscpd's
 * CLI keeps only the last repeated `--ignore` flag, so repeated flags
 * silently dropped every exclusion but the last before #1821-r2.
 * Production paths: apps/api, apps/front/src, packages/shared-ts.
 *
 *   - Production clone pairs (unique, non-spec): 422, 10 213 lines
 *   - Production self-duplication files: 48, 1 473 lines
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

/**
 * Spec/test/generated file patterns — excluded from BOTH gated surfaces
 * (pairs AND self-duplication). C# `*.Spec.cs` is this repo's standard
 * co-located test suffix (AGENTS.md); `*.Tests.cs` and `*.g.cs` cover the
 * test-suite and generated-code variants. Before #1821-r2 the C# suffixes
 * were missing, so C# spec duplication tripped the production ratchet and
 * made up 80.6% of the AUTO metric.
 */
const SPEC_PATTERNS: RegExp[] = [
	/\.test\.tsx?$/,
	/\.spec\.tsx?$/,
	/\.Spec\.cs$/,
	/\.Tests\.cs$/,
	/\.g\.cs$/,
	/\/test\//,
	/\/spec\//,
	/\/tests\//,
	/\/specs\//,
	/\/__tests__\//,
	/\/__specs__\//,
];

/**
 * Whether a file path is inside a production path prefix.
 */
const isProductionPath = (filePath: string): boolean => {
	for (const prefix of PRODUCTION_PATHS) {
		if (filePath.startsWith(prefix + '/') || filePath === prefix) {
			return true;
		}
	}
	return false;
};

/**
 * Whether a file is a spec/test/generated file.
 */
const isSpecFile = (filePath: string): boolean => {
	for (const pat of SPEC_PATTERNS) {
		if (pat.test(filePath)) {
			return true;
		}
	}
	return false;
};

/** jscpd@4 clone entry shape (the subset the guard reads). */
export interface JscpdCloneEntry {
	firstFile?: { name?: string };
	secondFile?: { name?: string };
	lines?: number;
}

/** jscpd@4 report shape (the subset the guard reads). */
export interface JscpdReport {
	statistics?: { total?: { clones?: number } };
	duplicates?: JscpdCloneEntry[];
}

/** Per-pair bookkeeping (production surface). */
interface PairInfo {
	lines: number;
	fragments: number;
	files: [string, string];
}

/** Per-pair bookkeeping (spec surface). */
interface SpecPairInfo {
	lines: number;
	files: [string, string];
}

/** Self-duplication bookkeeping entry for file naming. */
interface AutoInfo {
	file: string;
	lines: number;
}

/** The stats computed by computeProductionStats. */
export interface ProductionStats {
	pairCount: number;
	pairLines: number;
	autoCount: number;
	autoLines: number;
	specPairCount: number;
	specPairLines: number;
	specAutoCount: number;
	specAutoLines: number;
	topPairs: PairInfo[];
	topAuto: AutoInfo[];
}

/**
 * jscpd@4 report shape (the JSON key for clone entries is "duplicates",
 * not "statistics.clones").
 */
interface ReadReportResult {
	ok: boolean;
	error?: string;
	data?: JscpdReport;
}

const readReport = (reportPath: string): ReadReportResult => {
	if (!fs.existsSync(reportPath)) {
		return {
			ok: false,
			error: `Report not found: ${reportPath}. Run jscpd first.`,
		};
	}

	let content: string;
	try {
		content = fs.readFileSync(reportPath, 'utf-8');
	} catch (e) {
		return { ok: false, error: `Cannot read report: ${String(e)}` };
	}

	let data: JscpdReport;
	try {
		data = JSON.parse(content) as JscpdReport;
	} catch (e) {
		return { ok: false, error: `Malformed JSON: ${String(e)}` };
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
interface ReadReferenceResult {
	ok: boolean;
	error?: string;
	data?: ReferenceValues;
}

interface ReferenceValues {
	productionPairs?: { count?: number; lines?: number };
	productionAuto?: { count?: number; lines?: number };
}

const readReference = (refPath: string): ReadReferenceResult => {
	if (!fs.existsSync(refPath)) {
		return {
			ok: false,
			error: `Reference not found: ${refPath}`,
		};
	}

	let content: string;
	try {
		content = fs.readFileSync(refPath, 'utf-8');
	} catch (e) {
		return { ok: false, error: `Cannot read reference: ${String(e)}` };
	}

	let data: ReferenceValues;
	try {
		data = JSON.parse(content) as ReferenceValues;
	} catch (e) {
		return { ok: false, error: `Malformed reference JSON: ${String(e)}` };
	}

	return { ok: true, data };
};

/**
 * Computes production duplication statistics from the jscpd report.
 *
 * - productionPairs: unique (a,b) pairs where both files are production and
 *   neither is a spec/test/generated file. EVERY jscpd clone fragment between
 *   the two files counts: when an already-paired pair gains one more identical
 *   block, its lines are added to the pair total. This is the accumulation
 *   pattern #1821 targets (the Update* handler families, the copied error-view
 *   files): a "first fragment wins" count made that growth invisible.
 * - productionAuto: unique files that are production, not spec/test/generated,
 *   and self-duplicated. EVERY self-dup fragment in a file sums — a second
 *   identical block added to an already-self-duplicated file must move the
 *   metric, or accumulation inside one file stays invisible.
 * - spec* surfaces mirror the pair/auto shapes for spec/test/generated files:
 *   reported in the output, never gating (issue #1821 requirement 2).
 */
export const computeProductionStats = (
	dupes: JscpdCloneEntry[],
): ProductionStats => {
	// key `${a}|${b}` -> { lines (sum of all fragments), fragments, files }
	const pairMap = new Map<string, PairInfo>();
	// file -> max duplicate-lines value
	const autoMap = new Map<string, number>();
	// same shapes for the spec/test/generated surface (reported, not gated)
	const specPairMap = new Map<string, SpecPairInfo>();
	const specAutoMap = new Map<string, number>();

	for (const dupe of dupes) {
		const f0 = dupe.firstFile?.name ?? '';
		const f1 = dupe.secondFile?.name ?? '';
		const lines = dupe.lines ?? 0;

		if (!f0 || !f1) {
			continue;
		}

		if (f0 === f1) {
			const inProduction = isProductionPath(f0);
			const spec = isSpecFile(f0);
			let target: Map<string, number> | null = null;
			if (inProduction) {
				target = spec ? specAutoMap : autoMap;
			}
			if (target) {
				// SUM every self-dup fragment in the file. A "max fragment wins"
				// count made an additional identical block in an already
				// self-duplicated file invisible (create-hooks.ts: 15 fragments
				// [13,10,49,14,15,34,15,23,40,21,23,12,40,21,8] = 338 dup lines,
				// of which the max fragment is only 49). The ratchet must see
				// the file's TOTAL duplicated lines grow.
				const prev = target.get(f0) ?? 0;
				target.set(f0, prev + lines);
			}
		} else {
			const p0 = isProductionPath(f0);
			const p1 = isProductionPath(f1);
			if (!(p0 && p1)) {
				continue;
			}

			// Canonical key so (a,b) and (b,a) are the same pair.
			const key = f0 < f1 ? `${f0}|${f1}` : `${f1}|${f0}`;

			if (isSpecFile(f0) || isSpecFile(f1)) {
				const prev = specPairMap.get(key);
				if (prev) {
					prev.lines += lines;
				} else {
					specPairMap.set(key, { lines, files: [f0, f1] });
				}
			} else {
				const prev = pairMap.get(key);
				if (prev) {
					prev.lines += lines;
					prev.fragments += 1;
				} else {
					pairMap.set(key, { lines, fragments: 1, files: [f0, f1] });
				}
			}
		}
	}

	const sumLines = (
		map: Map<string, number | PairInfo | SpecPairInfo>,
	): number => {
		let total = 0;
		for (const v of map.values()) {
			total += typeof v === 'number' ? v : v.lines;
		}
		return total;
	};

	const topPairs: PairInfo[] = [...pairMap.values()]
		.sort((a, b) => b.lines - a.lines)
		.slice(0, 5);
	const topAuto: AutoInfo[] = [...autoMap.entries()]
		.map(([file, fileLines]) => ({ file, lines: fileLines }))
		.sort((a, b) => b.lines - a.lines)
		.slice(0, 5);

	return {
		pairCount: pairMap.size,
		pairLines: sumLines(pairMap),
		autoCount: autoMap.size,
		autoLines: sumLines(autoMap),
		specPairCount: specPairMap.size,
		specPairLines: sumLines(specPairMap),
		specAutoCount: specAutoMap.size,
		specAutoLines: sumLines(specAutoMap),
		topPairs,
		topAuto,
	};
};

/**
 * Human-readable "Files: a <-> b (N lines, M fragments)" for the top pair
 * contributors, so a red guard names its cause (house rule: a failure must
 * name the file).
 */
const formatTopPairs = (pairs: PairInfo[]): string =>
	pairs
		.map(
			(p) =>
				`${p.files[0]} <-> ${p.files[1]}` +
				` (${p.lines} lines, ${p.fragments} fragment${p.fragments === 1 ? '' : 's'})`,
		)
		.join('; ');

/**
 * Human-readable "File: x (N lines)" for the top self-duplicated files.
 */
const formatTopAuto = (auto: AutoInfo[]): string =>
	auto.map((a) => `${a.file} (${a.lines} lines)`).join('; ');

/** Result of verifyJscpdRatchet — an empty errors array means pass. */
export interface RatchetVerdict {
	errors: string[];
	stats: ProductionStats | null;
}

/**
 * Main guard logic. Every ratchet violation names the top contributing files
 * (house rule: a failure must name its cause in plain words).
 */
export const verifyJscpdRatchet = (
	reportPath_?: string,
	refPath_?: string,
): RatchetVerdict => {
	const reportPath =
		reportPath_ ??
		path.resolve(repoRoot, '.dump/jscpd-report.json/jscpd-report.json');
	const refPath =
		refPath_ ??
		path.resolve(repoRoot, 'packages/scripts-ts/src/jscpd-reference.json');
	const errors: string[] = [];

	const reportResult = readReport(reportPath);
	if (!reportResult.ok || reportResult.data === undefined) {
		return {
			errors: [
				`jscpd report unavailable: ${reportResult.error ?? 'unknown error'}`,
			],
			stats: null,
		};
	}
	const report = reportResult.data;

	const refResult = readReference(refPath);
	if (!refResult.ok || refResult.data === undefined) {
		return {
			errors: [
				`jscpd reference file unavailable: ${refResult.error ?? 'unknown error'}`,
			],
			stats: null,
		};
	}
	const ref = refResult.data;

	// jscpd@4 places clone entries in the "duplicates" array.
	const dupes = report.duplicates ?? [];
	const stats = computeProductionStats(dupes);

	// --- Production pairs: strict ratchet ---

	const refPairs = ref.productionPairs ?? { count: 0, lines: 0 };
	const refPairsCount = refPairs.count ?? 0;
	const refPairsLines = refPairs.lines ?? 0;

	if (stats.pairCount > refPairsCount) {
		errors.push(
			`Production clone pairs increased from ${refPairsCount} to ${stats.pairCount} ` +
				`(+${stats.pairCount - refPairsCount}). Merge duplicate logic or extract shared utilities.` +
				` Largest pair contributors (by duplicated lines): ${formatTopPairs(stats.topPairs)}.` +
				` Full list: run jscpd and diff against the report the guard read.`,
		);
	}

	if (stats.pairLines > refPairsLines) {
		errors.push(
			`Production duplicate lines increased from ${refPairsLines} to ${stats.pairLines} ` +
				`(+${stats.pairLines - refPairsLines}). Remove or deduplicate the copied code.` +
				` Largest pair contributors (by duplicated lines): ${formatTopPairs(stats.topPairs)}.`,
		);
	}

	// --- Production self-duplication: strict ratchet ---

	const refAuto = ref.productionAuto ?? { count: 0, lines: 0 };
	const refAutoCount = refAuto.count ?? 0;
	const refAutoLines = refAuto.lines ?? 0;

	if (stats.autoCount > refAutoCount) {
		errors.push(
			`Production self-duplication files increased from ${refAutoCount} to ${stats.autoCount} ` +
				`(+${stats.autoCount - refAutoCount}). Refactor these files to remove internal duplication.` +
				` Files: ${formatTopAuto(stats.topAuto)}.`,
		);
	}

	if (stats.autoLines > refAutoLines) {
		errors.push(
			`Production self-duplication lines increased from ${refAutoLines} to ${stats.autoLines} ` +
				`(+${stats.autoLines - refAutoLines}). Reduce the duplicated lines in these files.` +
				` Files: ${formatTopAuto(stats.topAuto)}.`,
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

	return { errors, stats };
};

/**
 * CLI entry point.
 */
const main = (): void => {
	const reportPath =
		process.argv[2] ??
		path.resolve(repoRoot, '.dump/jscpd-report.json/jscpd-report.json');
	const refPath =
		process.argv[3] ??
		path.resolve(repoRoot, 'packages/scripts-ts/src/jscpd-reference.json');

	const { errors, stats } = verifyJscpdRatchet(reportPath, refPath);

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
	if (stats && stats.specPairCount + stats.specAutoCount > 0) {
		// Spec/test/generated duplication is reported, never blocking (#1821).
		console.log(
			`Not gated (spec/test/generated): ${stats.specPairCount} clone pairs / ${stats.specPairLines} lines; ` +
				`${stats.specAutoCount} self-dup files / ${stats.specAutoLines} lines.`,
		);
	}
	process.exit(0);
};

if (
	process.argv[1] !== undefined &&
	import.meta.url === pathToFileURL(process.argv[1]).href
) {
	main();
}
