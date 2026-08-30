/**
 * Production duplication ratchet guard (#1821, re-anchored in #1890).
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
 * THE GUARD FAILS LOUDLY when the jscpd report is absent, empty, or
 * malformed, and when the reference cannot be read from the merge base
 * (house rule: an unreadable input is a loud failure that names the cause
 * and the expected action — never a compliant default, never a silent
 * fallback to the working tree).
 *
 * BASE ANCHOR (#1890)
 * -------------------
 * The reference is read from the MERGE BASE, not from this tree:
 *
 *   - CI (`GITHUB_BASE_REF` set): `git show <ref>:<path>` with
 *     <ref> = refs/remotes/origin/<GITHUB_BASE_REF> (the actions/checkout
 *     of a pull request fetches the base branch; if the ref is missing the
 *     guard fetches it once and retries, then fails loud naming both
 *     attempts).
 *   - local: <ref> = refs/remotes/origin/develop (same fetch-once-then-fail
 *     loud behaviour for air-gapped machines).
 *
 * This closes the measured bypass (issue #1890): a pull request that adds
 * real duplication AND raises the committed reference in the same commit
 * passed the old guard, because the old guard read the reference from the
 * pull request's own tree — a guard that attests a model (the reference the
 * PR supplies) instead of the real artifact. With the reference anchored
 * to the base, a pull request cannot move the bar it is measured against:
 * the reference diff stays visible in review, and the guard compares
 * against the value the base branch has.
 *
 * RAISING A THRESHOLD LEGITIMATELY (a new production surface)
 * -----------------------------------------------------------
 * An explicit, reviewed act — never a silent raise:
 *
 *   1. Commit the new `jscpd-reference.json` in the pull request,
 *      regenerated with `node packages/scripts-ts/src/gen-jscpd-reference.ts`
 *      (keeps the four aggregate counters in sync with the stored per-pair
 *      and per-file base totals, so the file stays internally consistent).
 *   2. Add a `docs/records/` change record that names the surface that
 *      moved the metric and the measured numbers.
 *   3. The pull request's CI guard is then RED BY DESIGN: it measures the
 *      tree against the base (pre-raise) reference and names the exact
 *      pairs/files that crossed their base. The review question becomes
 *      "are these pairs the legitimate new surface?" — decided by a human
 *      with merge override, not by the guard. Once merged, the base moves
 *      and every subsequent pull request is measured against the new
 *      baseline.
 *
 * The guard itself can never approve its own loosening: any mechanism that
 * accepted a raise declared in the pull request's own tree would reopen
 * the exact bypass this guard exists to close.
 *
 * NAMING THE OFFENDER (#1890)
 * ---------------------------
 * A red message names the EXACT pair (or self-duplicated file) that
 * crossed its base total, not just the top five contributors by duplicated
 * lines — a new offender can sit below the top-5 cut:
 *
 *   - pairs: every production pair whose line total strictly exceeds its
 *     base-pair total (a new pair has base total 0). Each is named with
 *     both files, its base total, and its current total (up to 8, the
 *     remainder counted).
 *   - self-duplication: every self-duplicated file whose line total
 *     strictly exceeds its base total. Same naming rule.
 *   - legacy reference (no per-pair map): the top-5 contributor list is
 *     printed instead, and the message says so.
 *
 * Every failure message states what it was measured against
 * (`Measured against git:refs/remotes/origin/develop`, …).
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
 *   (values as of the #1859 round 2 baseline; per-pair and per-file base
 *    totals live in jscpd-reference.json, populated in #1890)
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

/** Repository-relative path of the committed reference file. */
const REFERENCE_RELATIVE_PATH = 'packages/scripts-ts/src/jscpd-reference.json';

/** Default jscpd report location (the `just ci-jscpd` scan target). */
const DEFAULT_REPORT_PATH = path.resolve(
	repoRoot,
	'.dump/jscpd-report.json/jscpd-report.json',
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
	/**
	 * Raw per-pair totals, populated only when computeProductionStats is
	 * called with { withMaps: true } — needed to name the EXACT offender
	 * (the top-5 cut hides small new pairs).
	 */
	pairMaps?: Map<string, PairInfo>;
	/** Raw per-file self-dup totals (same opt-in). */
	autoMaps?: Map<string, number>;
}

/**
 * computeProductionStats options.
 */
export interface ComputeOptions {
	withMaps?: boolean;
}

/**
 * Per-pair reference values: canonical "a|b" key -> base duplicated lines.
 * Absent in the legacy four-number reference, in which case the guard falls
 * back to the aggregate thresholds plus the top-5 contributor list.
 */
type PairLinesMap = Record<string, number>;

/** Per-file reference values: self-duplicated file -> base duplicated lines. */
type AutoLinesMap = Record<string, number>;

/**
 * Reference values file.
 *
 * Legacy shape (pre-#1890): only the aggregate counters. New shape: the
 * aggregate counters plus a per-pair and per-file base totals map — the
 * stored base report the guard uses to name the exact offending pair.
 */
interface ReferenceValues {
	productionPairs?: { count?: number; lines?: number };
	productionAuto?: { count?: number; lines?: number };
	pairLines?: PairLinesMap;
	autoLines?: AutoLinesMap;
}

/**
 * A reference resolved against the merge base (or an explicit seam).
 * `source` names where the values came from so every guard message can
 * state what it measured against — house rule: a failure must name its
 * cause.
 */
export interface ResolvedReference {
	data: ReferenceValues;
	source: string;
}

interface ReadReferenceFileResult {
	ok: boolean;
	error?: string;
	data?: ReferenceValues;
}

const readReferenceFile = (refPath: string): ReadReferenceFileResult => {
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
		return {
			ok: false,
			error: `Malformed reference JSON: ${String(e)}`,
		};
	}

	return { ok: true, data };
};

interface ReadBaseResult {
	ok: boolean;
	error?: string;
	data?: ResolvedReference;
}

/** git error text: stderr when git prints one, otherwise the message. */
const gitError = (e: unknown): string => {
	const err = e as { stderr?: string | Buffer; message?: string };
	if (err.stderr !== undefined && String(err.stderr).trim().length > 0) {
		return String(err.stderr).trim();
	}
	return String(e);
};

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

const gitShowBlob = (gitDir: string, ref: string, relPath: string): string =>
	execFileSync('git', ['show', `${ref}:${relPath}`], {
		cwd: gitDir,
		encoding: 'utf-8',
		timeout: 30_000,
	});

/**
 * Fetch the base branch once (shallow) when its remote-tracking ref is
 * missing. Best effort: the caller retries the read and fails loud naming
 * every attempt when the fetch does not help.
 */
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

/**
 * #1890 — read the reference from the merge base, never from this tree.
 *
 * Resolution order (first source that works wins):
 *   1. explicit ref argument (unit-test seam): a reference FILE path or a
 *      git ref name;
 *   2. `PUBLY_JSCPD_BASE_REF` (same two forms, environment seam);
 *   3. in CI (`GITHUB_BASE_REF` set): refs/remotes/origin/<base>, then the
 *      local <base> branch (actions/checkout of a pull request fetches the
 *      base branch; a direct push / merge_group checkout carries only the
 *      local branch);
 *   4. local: refs/remotes/origin/develop, then the local develop branch.
 *
 * When a git ref candidate is missing, the guard fetches the base branch
 * once and retries, then fails loud naming every attempt. The guard NEVER
 * substitutes a compliant default and NEVER falls back to the
 * working-tree reference: a fallback would be exactly the bypass being
 * closed here (a pull request that raises the threshold in the same commit
 * that adds the duplication).
 */
export const readReferenceFromBase = (
	gitDir: string = repoRoot,
	explicitRef?: string,
): ReadBaseResult => {
	const explain = (cause: string): string =>
		`jscpd reference unavailable from the merge base: ${cause}. ` +
		`Expected action: make the base ref available — CI: GITHUB_BASE_REF=` +
		`${process.env.GITHUB_BASE_REF ?? '(unset)'}; local: "git fetch origin develop" — ` +
		`so it carries ${REFERENCE_RELATIVE_PATH}. ` +
		`Refusing to fall back to the working-tree reference: a pull request ` +
		`must not be able to set the baseline it is measured against (#1890).`;

	const ref = explicitRef ?? process.env.PUBLY_JSCPD_BASE_REF;

	if (ref !== undefined && fs.existsSync(ref) && fs.statSync(ref).isFile()) {
		// Explicit seam: a reference file (unit tests, one-off runs).
		const fileResult = readReferenceFile(ref);
		if (!fileResult.ok || fileResult.data === undefined) {
			return {
				ok: false,
				error: explain(`${ref}: ${fileResult.error ?? 'unreadable'}`),
			};
		}
		return {
			ok: true,
			data: { data: fileResult.data, source: `file:${ref}` },
		};
	}

	const readGitRef = (candidate: string): ReadBaseResult => {
		if (!gitRefExists(gitDir, candidate)) {
			// Fetch once (the base branch name is the ref without the
			// remote-tracking prefix; bare names are already branch names).
			const branch = candidate.replace(/^refs\/remotes\/origin\//, '');
			const fetchErr = gitFetchBaseBranch(gitDir, branch);
			if (!gitRefExists(gitDir, candidate)) {
				const attempts =
					fetchErr === ''
						? `ref ${candidate} absent after fetch`
						: `ref ${candidate} absent, fetch failed: ${fetchErr}`;
				return { ok: false, error: explain(attempts) };
			}
		}
		let blob: string;
		try {
			blob = gitShowBlob(gitDir, candidate, REFERENCE_RELATIVE_PATH);
		} catch (e) {
			return {
				ok: false,
				error: explain(
					`git show ${candidate}:${REFERENCE_RELATIVE_PATH} failed: ` +
						gitError(e),
				),
			};
		}
		let data: ReferenceValues;
		try {
			data = JSON.parse(blob) as ReferenceValues;
		} catch (e) {
			return {
				ok: false,
				error: explain(
					`${candidate} contains malformed reference JSON: ${String(e)}`,
				),
			};
		}
		return {
			ok: true,
			data: { data, source: `git:${candidate}` },
		};
	};

	if (ref !== undefined) {
		return readGitRef(ref);
	}

	const baseBranch = process.env.GITHUB_BASE_REF;
	const candidates =
		baseBranch !== undefined && baseBranch.length > 0
			? [`refs/remotes/origin/${baseBranch}`, baseBranch]
			: ['refs/remotes/origin/develop', 'develop'];

	for (const candidate of candidates) {
		const result = readGitRef(candidate);
		if (result.ok) {
			return result;
		}
	}
	return {
		ok: false,
		error: explain(
			candidates.map((c) => `tried ${c}`).join(', then ') +
				'; no candidate carried the reference',
		),
	};
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
 *
 * With { withMaps: true } the raw per-pair / per-file maps are returned too —
 * the offender finders need the full maps, not the top-5 cut.
 */
export const computeProductionStats = (
	dupes: JscpdCloneEntry[],
	opts?: ComputeOptions,
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

	const stats: ProductionStats = {
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
	// The offender finders need the full maps, not the top-5 cut (#1890).
	if (opts?.withMaps === true) {
		stats.pairMaps = pairMap;
		stats.autoMaps = autoMap;
	}
	return stats;
};

/**
 * Human-readable "Files: a <-> b (N lines, M fragments)" for the top pair
 * contributors, so a red guard names its cause (house rule: a failure must
 * name the file). Fallback used only when the reference carries no
 * per-pair base totals (legacy reference).
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

/** A pair that crossed its stored base total. */
interface OffendingPair {
	files: [string, string];
	lines: number;
	baseLines: number;
}

/** A self-duplicated file that crossed its stored base total. */
interface OffendingAuto {
	file: string;
	lines: number;
	baseLines: number;
}

/** Maximum offenders named in one message before "+N more". */
const MAX_NAMED_OFFENDERS = 8;

/**
 * #1890 — name the EXACT pairs whose duplicated lines strictly exceed the
 * base total stored in the reference (a new pair has base total 0). This
 * designates the pair that crossed the threshold, which can sit below the
 * top-5 contributor cut the old message showed. Returns null when the
 * reference has no per-pair map (legacy reference) — the caller falls back
 * to the top-5 list and says so.
 */
export const findOffendingPairs = (
	pairMap: Map<string, PairInfo>,
	basePairLines: PairLinesMap | undefined,
): OffendingPair[] | null => {
	if (basePairLines === undefined || basePairLines === null) {
		return null;
	}
	const offenders: OffendingPair[] = [];
	for (const [key, info] of pairMap.entries()) {
		const base = basePairLines[key] ?? 0;
		if (info.lines > base) {
			offenders.push({
				files: info.files,
				lines: info.lines,
				baseLines: base,
			});
		}
	}
	offenders.sort((a, b) => b.lines - b.baseLines - (a.lines - a.baseLines));
	return offenders;
};

/**
 * #1890 — name the EXACT self-duplicated files whose duplicated lines
 * strictly exceed the base total stored in the reference. Same contract as
 * findOffendingPairs.
 */
export const findOffendingAuto = (
	autoMap: Map<string, number>,
	baseAutoLines: AutoLinesMap | undefined,
): OffendingAuto[] | null => {
	if (baseAutoLines === undefined || baseAutoLines === null) {
		return null;
	}
	const offenders: OffendingAuto[] = [];
	for (const [file, lines] of autoMap.entries()) {
		const base = baseAutoLines[file] ?? 0;
		if (lines > base) {
			offenders.push({ file, lines, baseLines: base });
		}
	}
	offenders.sort((a, b) => b.lines - b.baseLines - (a.lines - a.baseLines));
	return offenders;
};

const formatOffendingPairs = (offenders: OffendingPair[]): string => {
	const named = offenders.slice(0, MAX_NAMED_OFFENDERS);
	const more = offenders.length - named.length;
	const text = named
		.map(
			(o) =>
				`${o.files[0]} <-> ${o.files[1]} ` +
				`(${o.baseLines} -> ${o.lines} duplicated lines)`,
		)
		.join('; ');
	if (more > 0) {
		return `${text}; +${more} more`;
	}
	return text;
};

const formatOffendingAuto = (offenders: OffendingAuto[]): string => {
	const named = offenders.slice(0, MAX_NAMED_OFFENDERS);
	const more = offenders.length - named.length;
	const text = named
		.map((o) => `${o.file} (${o.baseLines} -> ${o.lines} duplicated lines)`)
		.join('; ');
	if (more > 0) {
		return `${text}; +${more} more`;
	}
	return text;
};

/** Result of verifyJscpdRatchet — an empty errors array means pass. */
export interface RatchetVerdict {
	errors: string[];
	stats: ProductionStats | null;
	/** Where the reference came from (null when no reference was read). */
	refSource: string | null;
}

/**
 * #1890 — main guard logic.
 *
 * @param reportPath_ path to the jscpd JSON report — the artifact the guard
 *   measures (never a model of it).
 * @param refPath_ optional explicit reference FILE, unit-test seam only.
 * @param baseRef_ explicit base reference for readReferenceFromBase
 *   (a reference file path or a git ref name), unit-test seam only.
 * @param gitDir_ explicit git directory for the base read (unit-test seam;
 *   defaults to the repository root).
 *
 * The default reference source is the MERGE BASE (see readReferenceFromBase).
 * The working-tree reference file is never read by the ratchet. Every
 * ratchet violation names the offending pair/file (house rule: a failure
 * must name its cause in plain words) and states what it was measured
 * against.
 */
export const verifyJscpdRatchet = (
	reportPath_?: string,
	refPath_?: string,
	baseRef_?: string,
	gitDir_?: string,
): RatchetVerdict => {
	const reportPath = reportPath_ ?? DEFAULT_REPORT_PATH;
	const errors: string[] = [];

	const reportResult = readReport(reportPath);
	if (!reportResult.ok || reportResult.data === undefined) {
		return {
			errors: [
				`jscpd report unavailable: ${reportResult.error ?? 'unknown error'}`,
			],
			stats: null,
			refSource: null,
		};
	}
	const report = reportResult.data;

	let resolved: ResolvedReference | undefined;
	if (refPath_ !== undefined) {
		// Unit-test seam: an explicit reference file. The base-anchor
		// contract is covered by the readReferenceFromBase tests; this seam
		// stays file-based so fixture tests never touch the git history.
		const fileResult = readReferenceFile(refPath_);
		if (!fileResult.ok || fileResult.data === undefined) {
			return {
				errors: [
					`jscpd reference file unavailable: ${fileResult.error ?? 'unknown error'}`,
				],
				stats: null,
				refSource: null,
			};
		}
		resolved = { data: fileResult.data, source: `file:${refPath_}` };
	} else {
		const baseResult = readReferenceFromBase(gitDir_ ?? repoRoot, baseRef_);
		if (!baseResult.ok || baseResult.data === undefined) {
			return {
				errors: [baseResult.error ?? 'unknown error'],
				stats: null,
				refSource: null,
			};
		}
		resolved = baseResult.data;
	}
	const ref = resolved.data;
	const refSource = resolved.source;

	// jscpd@4 places clone entries in the "duplicates" array.
	const dupes = report.duplicates ?? [];
	const stats = computeProductionStats(dupes, { withMaps: true });

	// --- Production pairs: strict ratchet ---

	const refPairs = ref.productionPairs ?? { count: 0, lines: 0 };
	const refPairsCount = refPairs.count ?? 0;
	const refPairsLines = refPairs.lines ?? 0;

	const pairOffenders =
		stats.pairMaps !== undefined
			? findOffendingPairs(stats.pairMaps, ref.pairLines)
			: null;
	const pairNaming =
		pairOffenders !== null && pairOffenders.length > 0
			? `Pairs that crossed their base: ${formatOffendingPairs(pairOffenders)}.`
			: `Largest pair contributors (by duplicated lines): ${formatTopPairs(stats.topPairs)}.`;

	if (stats.pairCount > refPairsCount) {
		errors.push(
			`Production clone pairs increased from ${refPairsCount} to ${stats.pairCount} ` +
				`(+${stats.pairCount - refPairsCount}). Merge duplicate logic or extract shared utilities. ` +
				pairNaming +
				` Measured against ${refSource}.`,
		);
	}

	if (stats.pairLines > refPairsLines) {
		errors.push(
			`Production duplicate lines increased from ${refPairsLines} to ${stats.pairLines} ` +
				`(+${stats.pairLines - refPairsLines}). Remove or deduplicate the copied code. ` +
				pairNaming +
				` Measured against ${refSource}.`,
		);
	}

	// --- Production self-duplication: strict ratchet ---

	const refAuto = ref.productionAuto ?? { count: 0, lines: 0 };
	const refAutoCount = refAuto.count ?? 0;
	const refAutoLines = refAuto.lines ?? 0;

	const autoOffenders =
		stats.autoMaps !== undefined
			? findOffendingAuto(stats.autoMaps, ref.autoLines)
			: null;
	const autoNaming =
		autoOffenders !== null && autoOffenders.length > 0
			? `Files that crossed their base: ${formatOffendingAuto(autoOffenders)}.`
			: `Files: ${formatTopAuto(stats.topAuto)}.`;

	if (stats.autoCount > refAutoCount) {
		errors.push(
			`Production self-duplication files increased from ${refAutoCount} to ${stats.autoCount} ` +
				`(+${stats.autoCount - refAutoCount}). Refactor these files to remove internal duplication. ` +
				autoNaming +
				` Measured against ${refSource}.`,
		);
	}

	if (stats.autoLines > refAutoLines) {
		errors.push(
			`Production self-duplication lines increased from ${refAutoLines} to ${stats.autoLines} ` +
				`(+${stats.autoLines - refAutoLines}). Reduce the duplicated lines in these files. ` +
				autoNaming +
				` Measured against ${refSource}.`,
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

	return { errors, stats, refSource };
};

/** jscpd report read result. */
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
 * CLI entry point.
 *
 * Usage: node check-jscpd.ts [reportPath] [referenceFilePath]
 *
 * The second positional argument (a reference FILE) is a local seam for
 * one-off runs and unit tests; the gate (`just ci-jscpd`) invokes the
 * guard without it, which reads the reference from the merge base.
 */
const main = (): void => {
	const reportPath = process.argv[2] ?? DEFAULT_REPORT_PATH;
	const refPath = process.argv[3];

	const { errors, stats, refSource } = verifyJscpdRatchet(reportPath, refPath);

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
	if (refSource !== null) {
		console.log(`Reference: ${refSource}`);
	}
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
