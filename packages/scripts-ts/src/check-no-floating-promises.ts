import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Ratchet guard for issue #1679.
//
// Counts `typescript(no-floating-promises)` warnings repo-wide and FAILS when
// the count deviates from the pinned baseline in
// packages/scripts-ts/src/no-floating-promises-baseline.json.
//
// Three directions:
//   - count > baseline  → regression: the warnings increased. Fail (withinLimit
//     is false). See issue #1679.
//   - count < baseline  → stale floor: the warnings decreased but the baseline
//     was not lowered. Fail (withinLimit is 'floor_stale'). The failure message
//     names the exact value to write into the baseline file. The ratchet never
//     writes the file itself — tightening the floor is a deliberate human gesture
//     (see issue #1727).
//   - count == baseline → green.
//
// Eleven of these were introduced silently with PR #1649 because warnings don't
// fail `pnpm lint` (which passes `--quiet`). A green suite is not evidence
// here — it was already green with the eleven warnings in place.
//
// Exit-code handling: oxlint exits 1 when it finds ERROR-severity problems —
// that is a normal lint outcome, and the JSON output is still valid and
// complete. oxlint exits 2 for config errors, 70 for internal errors, and null
// when killed by a signal; those mean the scan did not produce trustworthy
// output, so we fail closed.
//
// Measured on this tree, 2026-08-28: oxlint exits 0 with 494 diagnostics, all
// of them warnings (400 of which are this rule). So exit code 1 is NOT the
// present state of the repository — an earlier version of this comment claimed
// 34 no-deprecated errors force exit 1, and that claim is false here.
//
// The handling still matters, and here is the real reason: the first change
// that introduces a single error-severity finding anywhere in the repo flips
// oxlint to exit 1. With the previous `status !== 0` guard, this ratchet would
// then throw "cannot count reliably" — reporting a broken scan when the scan
// was in fact perfect. The author would chase a phantom tooling failure instead
// of reading their own lint error. Distinguishing 1 from 2/70/null is what
// keeps the failure message truthful.

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');
const baselinePath = path.join(here, 'no-floating-promises-baseline.json');
const oxlintBin = path.join(repoRoot, 'node_modules/oxlint/bin/oxlint');
const oxlintConfigPath = path.join(repoRoot, '.oxlintrc.json');

// Fail CLOSED: if the oxlint binary is missing or cannot be executed,
// we cannot verify the warning count — so we must refuse to pass rather
// than silently report "0 warnings, within limit". A ratchet that fails
// open is no ratchet at all; it would let a missing dependency mask a
// real regression. See issue #1679.
const assertOxlintAvailable = () => {
	if (!existsSync(oxlintBin)) {
		throw new Error(
			`oxlint binary not found at ${oxlintBin} — ` +
				'cannot count no-floating-promises warnings. Ensure `pnpm install` ' +
				'has run and oxlint is in node_modules.',
		);
	}
};

const runOxlint = () => {
	assertOxlintAvailable();

	const result = spawnSync(
		process.execPath,
		[oxlintBin, '--config', oxlintConfigPath, '--format', 'json'],
		{ cwd: repoRoot, encoding: 'utf8' },
	);

	if (result.error) {
		throw new Error(
			`Failed to execute oxlint: ${result.error.message} — ` +
				'cannot count no-floating-promises warnings.',
		);
	}

	// Handle different oxlint exit codes.
	//
	// oxlint uses structured exit codes:
	//   0 — clean (no problems found)
	//   1 — lint problems found (errors and/or warnings) — JSON output is valid
	//   2 — config error — scan did not run, output is unreliable
	//   70 — internal error — scan did not run, output is unreliable
	//   null — process was killed by a signal — output is unreliable
	//
	// Exit code 1 (lint problems found) is a NORMAL outcome, not a failure:
	// the JSON output is still valid and complete, and we count from it as
	// usual. See the note at the top of this file for the measurement — this
	// repository currently exits 0, and an earlier version of this comment
	// wrongly claimed otherwise.
	//
	// Only exit codes 2, 70, and null (signal kill) indicate a truly broken
	// scan — fail-closed for those.
	if (result.status === null) {
		throw new Error(
			`oxlint process was killed by a signal — ` +
				'cannot count no-floating-promises warnings reliably.',
		);
	}

	if (result.status === 2) {
		throw new Error(
			`oxlint exited with status 2 (config error) — ` +
				'cannot count no-floating-promises warnings reliably. ' +
				`stderr: ${result.stderr.slice(0, 500)}`,
		);
	}

	if (result.status === 70) {
		throw new Error(
			`oxlint exited with status 70 (internal error) — ` +
				'cannot count no-floating-promises warnings reliably. ' +
				`stderr: ${result.stderr.slice(0, 500)}`,
		);
	}

	// status 0 (clean) or status 1 (lint problems found): JSON output is valid.

	return {
		status: result.status,
		stdout: result.stdout,
		stderr: result.stderr,
	};
};

/**
 * Parse oxlint JSON output and count warnings matching `ruleName`.
 *
 * Fail-closed by design: oxlint's JSON format is the only output we know how
 * to interpret. Anything else — empty output, truncated JSON, garbled text,
 * an unexpected structure — makes us THROW, and the caller converts that into
 * an `withinLimit: 'error'` result. We never fall back to "0 warnings".
 *
 * Why JSON instead of the unix format we used to parse: the unix format is
 * line-oriented text. An empty or garbled line-oriented output silently
 * produces a count of 0, which passes green. JSON is structured: if the
 * output is not valid JSON, or not the shape we expect, JSON.parse fails
 * loud. That is exactly the fail-closed behaviour the ratchet needs — a
 * garbled oxlint must never look like "0 warnings, within limit".
 *
 * Issue #1767 — truncated scan detection:
 *   A scan that covers only a fraction of the repo's files can still produce
 *   a warning count within the baseline (fewer files → fewer warnings), so
 *   the gate stays GREEN while real violations hide in the unscanned files.
 *   To catch this, the baseline pins a `files_scanned_floor`. If oxlint scans
 *   fewer files than the floor, we refuse to report a count — the scan is
 *   truncated, not clean. The failure message names the floor and the actual
 *   count so the reader sees the truncation.
 */
const countWarningsFromJson = (
	output: string,
	ruleName: string,
	baselineCount: number,
	filesScannedFloor: number,
): number => {
	let parsed: unknown;
	try {
		parsed = JSON.parse(output);
	} catch {
		throw new Error(
			'oxlint output is not valid JSON — ' +
				'expected JSON from `--format json`, but parsing failed. ' +
				`Cannot count ${ruleName} warnings. Output (first 200 chars): ${output.slice(0, 200)}`,
		);
	}

	if (typeof parsed !== 'object' || parsed === null) {
		throw new Error(
			'oxlint JSON output is not an object — ' +
				`expected { diagnostics: [...], number_of_files: N }, got: ${output.slice(0, 200)}`,
		);
	}

	const parsedObj = parsed as Record<string, unknown>;

	if (!Array.isArray(parsedObj.diagnostics)) {
		throw new Error(
			'oxlint JSON output is missing the diagnostics array — ' +
				`expected { diagnostics: [...], number_of_files: N }, got: ${output.slice(0, 200)}`,
		);
	}

	// Fail-closed: the repo has thousands of TS/TSX files. If oxlint scanned 0,
	// something is wrong (config error, all files ignored, etc.). A count of 0
	// with 0 files scanned is not a real "within limit" result — it is a broken
	// scan that would silently pass.
	if (parsedObj.number_of_files === 0) {
		throw new Error(
			'oxlint scanned 0 files — ' +
				"expected to scan the repo's TS/TSX files. " +
				'Check the oxlint config and ignore patterns.',
		);
	}

	// Fail-closed on a truncated scan (issue #1767).
	//
	// A scan that covers only a fraction of the repo's files can still produce
	// a warning count within the baseline — fewer files means fewer warnings,
	// so a truncated scan would report "within limit" while real violations
	// hide in the unscanned files. The repo has thousands of TS/TSX files; a
	// scan that covers, say, 300 of them is not the same measurement as the
	// baseline, and comparing the two is meaningless.
	//
	// The baseline pins `files_scanned_floor`: the smallest number of files a
	// complete scan may cover. If oxlint scans fewer, the scan is truncated
	// and we refuse to report a count. This is distinct from the empty-scan
	// guard below (which catches 0 diagnostics with files scanned); a truncated
	// scan can still emit plenty of diagnostics, it just doesn't emit enough
	// to trust.
	//
	// `number_of_files` is the count oxlint itself reports. A mismatch between
	// it and the floor means the scan missed files (config drift, ignore
	// patterns that grew, an over-broad exclusion, or a file that became
	// unreadable). The failure message names both numbers so the reader sees
	// the gap.
	const numberOfFiles =
		typeof parsedObj.number_of_files === 'number' &&
		Number.isFinite(parsedObj.number_of_files)
			? parsedObj.number_of_files
			: 0;
	if (numberOfFiles < filesScannedFloor) {
		throw new Error(
			`oxlint scanned ${numberOfFiles} files, below the floor of ${filesScannedFloor} — ` +
				'the scan is truncated. Real violations may hide in the unscanned files. ' +
				'Check the oxlint config and ignore patterns. ' +
				`(baseline ${baselineCount} is only meaningful for a full scan.)`,
		);
	}

	const diagnostics = parsedObj.diagnostics as Array<Record<string, unknown>>;
	let count = 0;
	const emittedCodes = new Set<string>();

	for (const diagnostic of diagnostics) {
		if (typeof diagnostic.code === 'string') {
			emittedCodes.add(diagnostic.code);
		}
		// Counted regardless of `severity`. The pinned rule is what we are
		// ratcheting; oxlint escalating it from `warning` to `error` makes the
		// situation strictly worse, not invisible. Filtering on
		// `severity === 'warning'` used to blind the ratchet completely: with the
		// rule emitted as `error`, the code IS in `emittedCodes` (so the
		// dead-rule guard below stays silent) while `count` sits at 0 — a green
		// gate over any number of real violations.
		if (diagnostic.code === ruleName) {
			count += 1;
		}
	}

	// Fail-closed: the pinned rule name is compared to `diagnostic.code` by
	// exact string equality, so a rule name that matches NOTHING silently
	// counts zero — and zero is within any baseline. A mistyped hyphen, the
	// slash form `typescript/no-floating-promises` instead of oxlint's
	// `typescript(no-floating-promises)`, or a future rename by oxlint would
	// all leave this gate permanently green while the real warnings pile up.
	// That is a conforming default produced from input the guard could not
	// actually evaluate — the exact failure mode this ratchet exists to stop.
	//
	// So: if oxlint emitted diagnostics at all but NONE of them carries the
	// pinned rule name, the name is dead and we refuse to report a count.
	//
	// A scan that emits zero diagnostics in total cannot distinguish a dead
	// rule name from a genuinely clean repository — so it is handled by the
	// baseline instead, just below.
	if (diagnostics.length > 0 && !emittedCodes.has(ruleName)) {
		throw new Error(
			`the pinned rule name "${ruleName}" matches none of the ` +
				`${emittedCodes.size} rule codes oxlint actually emitted — ` +
				'refusing to report a count of 0, which would keep this gate ' +
				'green forever. Fix `rule` in no-floating-promises-baseline.json ' +
				"to one of oxlint's real codes. Emitted codes (first 10): " +
				[...emittedCodes].slice(0, 10).join(', '),
		);
	}

	// Fail-closed on the empty scan. Zero diagnostics is a legitimate result
	// only for a repository that genuinely has none; if the baseline records
	// violations that were there last run, an empty scan means the scan broke
	// (a config that ignores every TS file, a changed oxlint invocation), not
	// that the debt vanished. Refusing here costs one deliberate baseline edit
	// on the day the debt really reaches zero, and buys back the case where a
	// broken scan would report 0 <= baseline and stay green forever.
	if (diagnostics.length === 0 && baselineCount > 0) {
		throw new Error(
			'oxlint emitted zero diagnostics while the baseline records ' +
				`${baselineCount} — refusing to report a count of 0. Either the scan ` +
				'is broken (check the oxlint config and ignore patterns), or the ' +
				'debt genuinely reached zero, in which case lower `count` in ' +
				'no-floating-promises-baseline.json deliberately.',
		);
	}

	return count;
};

// The result type includes sentinels so the caller can distinguish three
// failure modes from the pass condition:
//   - 'error'        : the scan or baseline could not be evaluated (fail-closed)
//   - 'floor_stale'  : count < baseline; the floor is below the real count and
//                      must be lowered by a human
//   - false          : count > baseline; a regression was introduced
//   - true           : count == baseline; the ratchet is tight
type FloorStale = 'floor_stale';
type RatchetResult = {
	rule: string;
	baseline: number;
	actual: number;
	withinLimit: boolean | 'error' | FloorStale;
};

export const checkNoFloatingPromises = async (): Promise<RatchetResult> => {
	try {
		const baselineContent = await readFile(baselinePath, 'utf8');
		const baseline = JSON.parse(baselineContent) as {
			rule: string;
			count: number;
			files_scanned_floor?: number;
		};

		// Fail closed: an invalid baseline must never silently pass. A missing
		// rule or a missing/non-numeric count means we cannot verify the
		// ratchet — throwing here converts to withinLimit="error".
		if (typeof baseline.rule !== 'string' || baseline.rule.length === 0) {
			throw new Error(
				'baseline JSON is missing a valid `rule` string — ' +
					'cannot count no-floating-promises warnings without a rule to match.',
			);
		}
		if (
			typeof baseline.count !== 'number' ||
			!Number.isFinite(baseline.count)
		) {
			throw new Error(
				`baseline JSON has a missing or non-numeric \`count\` (${String(baseline.count)}) — ` +
					'cannot compare the warning count against an invalid baseline.',
			);
		}

		// Fail closed: `files_scanned_floor` must be a positive finite number.
		// A missing, zero, or non-numeric floor means we cannot detect a
		// truncated scan — throwing here converts to withinLimit="error".
		// Without the floor, a scan that covers only a fraction of the repo's
		// files could still report "within limit" while real violations hide in
		// the unscanned files (issue #1767).
		if (
			typeof baseline.files_scanned_floor !== 'number' ||
			!Number.isFinite(baseline.files_scanned_floor) ||
			baseline.files_scanned_floor <= 0
		) {
			throw new Error(
				`baseline JSON has a missing or invalid \`files_scanned_floor\` (${String(baseline.files_scanned_floor)}) — ` +
					'cannot detect a truncated scan without a positive floor. ' +
					'See issue #1767.',
			);
		}

		const { stdout } = runOxlint();
		const actualCount = countWarningsFromJson(
			stdout,
			baseline.rule,
			baseline.count,
			baseline.files_scanned_floor,
		);

		// Three directions — see the file header for the full rationale.
		//
		// count > baseline  → regression. withinLimit is false.
		// count < baseline  → stale floor. The warnings decreased but the
		//   baseline was not lowered. The ratchet refuses to pass, and the
		//   `run()` entry point prints the exact value to write so the user
		//   can tighten the floor with a deliberate commit. The file is never
		//   written automatically — see issue #1727.
		// count == baseline → green. withinLimit is true.
		if (actualCount < baseline.count) {
			return {
				rule: baseline.rule,
				baseline: baseline.count,
				actual: actualCount,
				withinLimit: 'floor_stale',
			};
		}

		return {
			rule: baseline.rule,
			baseline: baseline.count,
			actual: actualCount,
			withinLimit: actualCount <= baseline.count,
		};
	} catch (error) {
		console.error(
			`no-floating-promises ratchet failed: ${error instanceof Error ? error.message : String(error)}`,
		);
		return {
			rule: 'typescript(no-floating-promises)',
			baseline: 0,
			actual: 0,
			withinLimit: 'error',
		};
	}
};

export const run = async () => {
	const result = await checkNoFloatingPromises();

	if (result.withinLimit === 'error') {
		// The error was already logged; just exit nonzero.
		process.exit(1);
	}

	if (result.withinLimit === 'floor_stale') {
		// The count dropped below the pinned baseline — the floor is stale.
		// The ratchet refuses to pass so that every corrected violation
		// capitalises: tighten the floor or a regression can sneak back in
		// for free. The file is never written automatically (issue #1727).
		console.error(
			`${result.rule}: actual count ${result.actual} is below the pinned floor ${result.baseline} — floor is stale.`,
		);
		console.error(
			`Tighten the floor deliberately: write "count": ${result.actual} into ${baselinePath}. This is not automatic so the tightening is visible in a diff and remains a human decision.`,
		);
		console.error(
			'Removing warnings without lowering the floor lets new ones take their place for free — that is the regression this ratchet exists to prevent (issue #1727).',
		);
		process.exit(1);
	}

	if (result.withinLimit) {
		console.log(
			`${result.rule}: ${result.actual} (baseline ${result.baseline}) — within limit.`,
		);
		return;
	}

	console.error(
		`${result.rule}: ${result.actual} exceeds baseline ${result.baseline} — silent regression (issue #1679).`,
	);
	console.error(
		`If the new warnings are legitimate, fix them; if genuinely unavoidable, lower the baseline deliberately in ${baselinePath}.`,
	);
	process.exit(1);
};

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
	await run();
}
