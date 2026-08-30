/**
 * Typecheck coverage guard (#1758, #1760).
 *
 * This repo has been bitten twice by decorative typecheck coverage: an entry
 * listed in `include` without `allowJs` is silently ignored by tsc — the
 * production entry `server.mjs` was measured ZERO times in `tsc --listFiles`
 * (#1692 / #1758) — and a `typecheck` script that no gate calls protects
 * nothing (#1692). This guard closes both classes for the configs the front
 * `typecheck` script runs:
 *
 * 1. It REPLAYS each covered tsconfig with `tsc --noEmit --listFiles` and
 *    asserts that the real artifact files are present in the resulting
 *    program. An expected file that is absent — renamed, deleted, or dropped
 *    from an `include` — fails the guard loud, naming the config and the file.
 *    A regex over the config text would not count: the guard measures the
 *    actual program tsc builds.
 * 2. It is invoked from the `typecheck` script itself, so the CI step that
 *    runs `pnpm --filter front typecheck` executes it, and its own unit test
 *    runs inside the front test suite.
 *
 * FAIL-CLOSED: a config listed here that tsc cannot run, a program that lists
 * nothing, or a coverage table with no entries is a failure — never a skip.
 */

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FRONT_DIR = path.resolve(HERE, '..', '..');

export type CoverageExpectation = {
	/** Path of the tsconfig, relative to apps/front. */
	config: string;
	/** Artifact files that must appear in that config's program, relative to
	 * apps/front. */
	expected: readonly string[];
};

export const COVERAGE_EXPECTATIONS: readonly CoverageExpectation[] = [
	{
		config: 'tsconfig.server.json',
		expected: ['server.mjs'],
	},
];

/** Run `tsc --noEmit -p <config> --listFiles` and return the absolute paths
 * tsc put in the program. Throws (never returns an empty compliance) when tsc
 * itself fails — an input the guard cannot parse is a loud failure. */
export const runTscListFiles = (config: string): string[] => {
	const tscBin = path.join(FRONT_DIR, 'node_modules', '.bin', 'tsc');
	const result = spawnSync(tscBin, ['--noEmit', '-p', config, '--listFiles'], {
		cwd: FRONT_DIR,
		encoding: 'utf-8',
	});
	if (result.status !== 0) {
		throw new Error(
			`tsc failed for ${config} (exit ${String(result.status)}) — ` +
				`${String(result.stderr).trim()}`,
		);
	}
	return (result.stdout ?? '')
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => line.length > 0)
		.map((line) => path.resolve(line));
};

/** Expected files that are absent from the program. Pure, for the unit test. */
export const findMissingProgramFiles = (
	programFiles: readonly string[],
	expectedFiles: readonly string[],
): string[] => {
	const present = new Set(programFiles.map((file) => path.resolve(file)));
	return expectedFiles
		.map((file) => path.resolve(file))
		.filter((file) => !present.has(file));
};

const main = (): void => {
	if (COVERAGE_EXPECTATIONS.length === 0) {
		console.error(
			'typecheck coverage guard: no coverage expectations configured — ' +
				'nothing would be verified. Fail loud rather than report compliance.',
		);
		process.exit(1);
	}

	const problems: string[] = [];
	let expectedCount = 0;

	for (const { config, expected } of COVERAGE_EXPECTATIONS) {
		let programFiles: string[];
		try {
			programFiles = runTscListFiles(config);
		} catch (err) {
			problems.push(`${config}: ${(err as Error).message}`);
			continue;
		}

		if (programFiles.length === 0) {
			problems.push(
				`${config}: tsc --listFiles produced an empty program — ` +
					'examining nothing must never pass.',
			);
			continue;
		}

		const resolvedExpected = expected.map((file) =>
			path.resolve(FRONT_DIR, file),
		);
		expectedCount += resolvedExpected.length;
		for (const missing of findMissingProgramFiles(
			programFiles,
			resolvedExpected,
		)) {
			problems.push(
				`${config}: expected artifact absent from the typecheck program: ` +
					`${path.relative(FRONT_DIR, missing)}`,
			);
		}
	}

	if (problems.length > 0) {
		console.error('typecheck coverage guard FAILED:');
		for (const problem of problems) {
			console.error(`  ${problem}`);
		}
		process.exit(1);
	}

	console.log(
		`typecheck coverage guard: ${COVERAGE_EXPECTATIONS.length} config(s), ` +
			`${expectedCount} expected artifact(s) present in their programs [OK]`,
	);
};

const invokedDirectly =
	process.argv[1] &&
	path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
	main();
}
