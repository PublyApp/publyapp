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
 * What each config must attend:
 * - tsconfig.json — every real TypeScript file under e2e/ (specs + helpers).
 *   #1760 claimed this surface escaped all type checking; measured here it is
 *   already inside the main program (the tsconfig include globs match it),
 *   so this entry pins that measurement: a future edit that excludes e2e from
 *   the main config turns the guard red instead of silently reopening the gap.
 * - tsconfig.server.json — the production entry `server.mjs` (#1758).
 * - tsconfig.js-surfaces.json — the deploy/request-counter scripts and the
 *   tooling `.cjs` (#1760).
 *
 * FAIL-CLOSED: a config listed here that tsc cannot run, a program that lists
 * nothing, a coverage table with no entries, or an e2e tree that yields zero
 * files is a failure — never a skip.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FRONT_DIR = path.resolve(HERE, '..', '..');
const E2E_DIR = path.join(FRONT_DIR, 'e2e');

export type CoverageExpectation = {
	/** Path of the tsconfig, relative to apps/front. */
	config: string;
	/** Artifact files that must appear in that config's program, relative to
	 * apps/front. */
	expected: readonly string[];
};

export const EXPECTED_SERVER_FILES: readonly string[] = ['server.mjs'];

export const EXPECTED_JS_SURFACE_FILES: readonly string[] = [
	'deploy/request-counter/control-routes.mjs',
	'deploy/request-counter/control-routes.test.mjs',
	'deploy/request-counter/server.mjs',
	'src/components/ui/drawer-guard-tmp-dir.cjs',
];

/** Real `.ts`/`.tsx` files under a root, walked from the actual tree. Fails
 * closed on a missing root: a guard that reports compliance for a tree it
 * never read is worse than one that fails loud. */
export const listTypeScriptFiles = (root: string): string[] => {
	if (!existsSync(root)) {
		throw new Error(
			`the directory to scan does not exist — ${root}. The coverage guard ` +
				'cannot report compliance for a tree it never read.',
		);
	}

	const out: string[] = [];
	const walk = (dir: string): void => {
		for (const entry of readdirSync(dir)) {
			const full = path.join(dir, entry);
			if (statSync(full).isDirectory()) {
				if (entry === 'node_modules') {
					continue;
				}
				walk(full);
				continue;
			}
			if (full.endsWith('.ts') || full.endsWith('.tsx')) {
				out.push(full);
			}
		}
	};
	walk(root);
	return out;
};

/** Coverage table, resolved at run time so the e2e entry is measured from the
 * real tree rather than a copied list (a hand-maintained list would drift). */
export const resolveCoverageExpectations = (): CoverageExpectation[] => {
	const e2eFiles = listTypeScriptFiles(E2E_DIR);
	if (e2eFiles.length === 0) {
		throw new Error(
			`found ZERO e2e TypeScript files under ${E2E_DIR} — examining nothing ` +
				'must never pass.',
		);
	}
	return [
		{ config: 'tsconfig.json', expected: e2eFiles },
		{ config: 'tsconfig.server.json', expected: EXPECTED_SERVER_FILES },
		{
			config: 'tsconfig.js-surfaces.json',
			expected: EXPECTED_JS_SURFACE_FILES,
		},
	];
};

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
	let expectations: CoverageExpectation[];
	try {
		expectations = resolveCoverageExpectations();
	} catch (err) {
		console.error(`typecheck coverage guard FAILED: ${(err as Error).message}`);
		process.exit(1);
	}

	const problems: string[] = [];
	let expectedCount = 0;

	for (const { config, expected } of expectations) {
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
		`typecheck coverage guard: ${expectations.length} config(s), ` +
			`${expectedCount} expected artifact(s) present in their programs [OK]`,
	);
};

const invokedDirectly =
	process.argv[1] &&
	path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
	main();
}
