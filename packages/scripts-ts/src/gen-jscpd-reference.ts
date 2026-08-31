/**
 * #1890 — regenerate the committed jscpd baseline reference.
 *
 * The reference (`jscpd-reference.json`) anchors the duplication ratchet to
 * the base branch. Raising it is an explicit, reviewed act (a new production
 * surface), and this generator is the one way to do it: it reads the CURRENT
 * jscpd report (the real artifact, never a model of it), recomputes the four
 * aggregate counters with the guard's own `computeProductionStats`, and
 * stores the per-pair and per-file base totals the guard uses to name the
 * exact offending pair.
 *
 * The generator refuses to write the file when the report is missing or
 * malformed (house rule: an unreadable input is a loud failure) and prints
 * the old-vs-new counters so the change is reviewable. A raise is only as
 * honest as the report it was generated from: run the same scan the gate
 * runs (`just ci-jscpd` step 1) first, then this script, then commit both
 * the new reference and a docs/records/ change record naming the surface
 * that moved the metric.
 *
 * Usage (from the repository root):
 *   node packages/scripts-ts/src/gen-jscpd-reference.ts [reportPath]
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { computeProductionStats } from './check-jscpd.ts';

const repoRoot = path.resolve(
	path.dirname(new URL(import.meta.url).pathname),
	'../../..',
);

const REFERENCE_PATH = path.join(
	repoRoot,
	'packages/scripts-ts/src/jscpd-reference.json',
);
const DEFAULT_REPORT_PATH = path.resolve(
	repoRoot,
	'.dump/jscpd-report.json/jscpd-report.json',
);

/** Report shape (the subset the generator reads). */
interface JscpdReportInput {
	statistics?: { total?: { clones?: number } };
	duplicates?: {
		firstFile?: { name?: string };
		secondFile?: { name?: string };
		lines?: number;
	}[];
}

/** The previous reference's aggregate counters (the rest is discarded). */
interface PreviousReference {
	productionPairs?: { count?: number; lines?: number };
	productionAuto?: { count?: number; lines?: number };
}

const main = (): void => {
	const reportPath = process.argv[2] ?? DEFAULT_REPORT_PATH;

	if (!fs.existsSync(reportPath)) {
		console.error(
			`Cannot regenerate the jscpd reference: report not found: ${reportPath}. ` +
				`Run the gate scan first (just ci-jscpd, step 1) and re-run this generator.`,
		);
		process.exit(1);
	}

	let report: JscpdReportInput;
	try {
		report = JSON.parse(fs.readFileSync(reportPath, 'utf-8')) as typeof report;
	} catch (e) {
		console.error(
			`Cannot regenerate the jscpd reference: malformed report ${reportPath}: ${String(e)}`,
		);
		process.exit(1);
	}

	if (!report.statistics || !Array.isArray(report.duplicates)) {
		console.error(
			`Cannot regenerate the jscpd reference: ${reportPath} is not a ` +
				`jscpd JSON report (missing "statistics" or "duplicates").`,
		);
		process.exit(1);
	}

	const stats = computeProductionStats(report.duplicates, {
		withMaps: true,
	});

	// Aggregate the canonical key -> base lines map (the key is the
	// canonical a|b order computeProductionStats uses).
	const pairLines: Record<string, number> = {};
	if (stats.pairMaps !== undefined) {
		for (const [key, info] of stats.pairMaps.entries()) {
			pairLines[key] = info.lines;
		}
	}
	const autoLines: Record<string, number> = {};
	if (stats.autoMaps !== undefined) {
		for (const [file, info] of stats.autoMaps.entries()) {
			autoLines[file] = info.lines;
		}
	}

	let previous: PreviousReference | null = null;
	if (fs.existsSync(REFERENCE_PATH)) {
		try {
			previous = JSON.parse(
				fs.readFileSync(REFERENCE_PATH, 'utf-8'),
			) as PreviousReference;
		} catch (e) {
			console.error(
				`Cannot regenerate the jscpd reference: the existing ` +
					`${REFERENCE_PATH} is malformed: ${String(e)}`,
			);
			process.exit(1);
		}
	}

	const next = {
		$comment:
			'jscpd@4 --min-tokens 50 baseline (regenerated with ' +
			'packages/scripts-ts/src/gen-jscpd-reference.ts, #1932). The ' +
			'aggregate counters gate the ratchet; pairLines/autoLines store ' +
			'the per-pair and per-file base totals so a red guard names the ' +
			'exact pair that crossed its base (not just the top-5 ' +
			'contributors). Raising this file is a reviewed act: commit it ' +
			'with a docs/records/ change record naming the surface that ' +
			"moved the metric, and note that the PR's own CI run is red by " +
			'design (it measures against the base, pre-raise reference). ' +
			'Exclusions: node_modules, bin, obj, dist, .artifacts, ' +
			'Migrations, .worktrees, packages/client-ts, apps/front/scripts ' +
			'— passed as ONE comma-separated --ignore value (repeated ' +
			'--ignore flags silently drop all but the last; measured in ' +
			'#1821-r2). Production paths: apps/api, apps/front/src, ' +
			'packages/shared-ts. Spec/test/generated files are excluded ' +
			'from BOTH gated surfaces and only reported.',
		productionPairs: {
			count: stats.pairCount,
			lines: stats.pairLines,
		},
		productionAuto: {
			count: stats.autoCount,
			lines: stats.autoLines,
		},
		pairLines,
		autoLines,
	};

	console.log('jscpd reference regeneration:');
	console.log(
		`  production pairs: ${previous?.productionPairs?.count ?? '(new)'} -> ${stats.pairCount} ` +
			`(${previous?.productionPairs?.lines ?? '(new)'} -> ${stats.pairLines} lines)`,
	);
	console.log(
		`  production auto:  ${previous?.productionAuto?.count ?? '(new)'} -> ${stats.autoCount} ` +
			`(${previous?.productionAuto?.lines ?? '(new)'} -> ${stats.autoLines} lines)`,
	);
	console.log(
		`  stored base totals: ${Object.keys(pairLines).length} pairs, ` +
			`${Object.keys(autoLines).length} self-dup files`,
	);

	if (
		stats.pairCount < (previous?.productionPairs?.count ?? 0) ||
		stats.pairLines < (previous?.productionPairs?.lines ?? 0) ||
		stats.autoCount < (previous?.productionAuto?.count ?? 0) ||
		stats.autoLines < (previous?.productionAuto?.lines ?? 0)
	) {
		console.error(
			'REFUSED: the measured tree has FEWER duplicates than the ' +
				'committed reference. That means the scan differs from the one ' +
				'that established the baseline (tree, jscpd version, or ' +
				'exclusion list drifted) — do not ratchet the reference ' +
				'down from a mismatched scan. Investigate the report first.',
		);
		process.exit(1);
	}

	fs.writeFileSync(REFERENCE_PATH, `${JSON.stringify(next, null, '\t')}\n`);
	console.log(`Wrote ${path.relative(process.cwd(), REFERENCE_PATH)}`);
	console.log(
		'Remember: commit the regenerated reference together with a ' +
			'docs/records/ change record naming the surface that moved the ' +
			'metric. Until merge, CI measures against the base reference and ' +
			'will be red by design, naming the new surface.',
	);
	process.exit(0);
};

if (
	process.argv[1] !== undefined &&
	import.meta.url === pathToFileURL(process.argv[1]).href
) {
	main();
}
