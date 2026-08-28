#!/usr/bin/env node
/*
 * run-preuves.mts — executes kept-red proof tests declared by the current pull
 * request under apps/front/tests/proofs/.
 *
 * Each proof test in this repo is EXPECTED TO FAIL. It proves a bug is present
 * by asserting the ideal behavior against the corrected code — the corrected
 * code does NOT satisfy the ideal, so the test fails, and that failure IS the
 * proof.
 *
 * ## Option (b) — declaration-scoped replay (issue #1659, ronde 6)
 *
 * A pull request DECLARES a paired red proof by adding or modifying a proof
 * test file under apps/front/tests/proofs/<issue>/. That directory is versionné
 * (committed to the repo), so CI can always see the files — unlike .dump/,
 * which is git-ignored and absent on a clean CI checkout.
 *
 * The script answers two questions:
 *
 * 1. Has THIS PR declared any proofs?
 *    Uses `git diff --name-only <base> HEAD` to find files under tests/proofs/
 *    that were added or modified by this PR. If none, the step is an explicit
 *    no-op: it prints a clear "no proofs declared" message and exits 0. This
 *    is NOT a silent green — it states exactly what was checked and why the
 *    step did not run. PRs that do not claim a paired red proof are simply out
 *    of scope, and the step says so.
 *
 * 2. Was a declared proof actually replayed?
 *    If a PR declares proofs, this script replays them with inverted semantics:
 *    - If a proof test FAILS  → success (bug still present, proof intact).
 *    - If a proof test PASSES → FAILURE (bug changed form or fixed; rebuild).
 *    - If a proof file is corrupt → FAILURE (naming the file).
 *
 * ## Design — inverting the burden of proof (r6)
 *
 * Previous versions discovered "all proof files" with a regex filter and then
 * intersected with the PR's diff. The filter was a mutable point of failure:
 * changing `/\.test\.tsx?$/` to `/\.test\.ts$/` silently excluded .tsx proofs
 * and turned the guard into a no-op while every proof stayed red.
 *
 * This version inverts the burden:
 *
 * - The PR's `git diff` is the source of truth for what was declared. No regex
 *   is applied to the result. Every file added/modified under tests/proofs/ is
 *   a declared proof.
 * - Each declared file is then validated: does it exist? does it have a
 *   replayable extension? is its content parseable? A declared file the guard
 *   cannot replay FAILS the step naming the file — it is never silently
 *   ignored.
 * - A git diff failure FAILS the step. An unresolvable base can never become a
 *   compliant default; an input the guard cannot parse must be loud.
 *
 * This removes the guard's single mutable point of failure. No change to the
 * guard's own code can flip it from "bites" to "silent green" without also
 * breaking the `git diff` contract or the extension check — both of which are
 * externally observable.
 *
 * The developer replay path is `just test-preuves` (lane worktree where .dump/
 * also exists for traces). CI runs the same command on a clean checkout.
 *
 * ## Why not (a) or (c)?
 * See .dump/DONE-1687-r5.md for the full rationale.
 */
import { execFileSync, execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(process.cwd(), '..'); // apps/front → repo root
const PROOFS_DIR = join(process.cwd(), 'tests', 'proofs');
const CONFIG = 'vitest.preuves.config.ts';

/**
 * Extensions that vitest.preuves.config.ts can replay. The config's include
 * pattern matches only .test.ts and .test.tsx files under tests/proofs/ — any
 * file with a different extension is declared by the PR but cannot be
 * replayed by the runner, which means the guard cannot verify it. Such a
 * file must fail the step loud.
 */
const REPLAYABLE_EXTENSIONS = ['.test.ts', '.test.tsx'] as const;


/**
 * Determine which proof files were declared by the current PR.
 *
 * The PR's `git diff` is the single source of truth — no regex filter is
 * applied afterward. Every file added or modified under tests/proofs/ is a
 * declared proof, regardless of its extension. The caller is responsible for
 * validating that each declared file is replayable.
 *
 * In CI, GITHUB_BASE_REF and GITHUB_HEAD_REF are available. We use a
 * two-dot diff (refs/remotes/origin/<base>..HEAD) to list every file that
 * differs between the base branch and the PR's HEAD. This is robust even
 * when the base ref and HEAD share no merge base (a diverged branch), where
 * a three-dot diff would fail with "no merge base". The two-dot form may
 * include base-branch changes introduced since the fork — conservatively
 * treating them as declared — but it never silently misses a proof the PR
 * actually added.
 *
 * GitHub's checkout action fetches only the PR's own ref by default — the
 * base branch's remote ref (refs/remotes/origin/<base>) is NOT available
 * until we fetch it. We fetch it explicitly before the diff so the guard
 * works on a clean CI checkout. The fetch is scoped to the single base ref
 * and is fast (a few hundred KB at most).
 *
 * Locally (no env vars), we use two-dot diff (HEAD~1..HEAD) to show what the
 * most recent commit introduced.
 *
 * @returns The list of proof-test paths (relative to apps/front) that were
 *          added or modified in the diff.
 * @throws If `git diff` fails. An unresolvable base can never silently become
 *         "no proofs declared"; the operator must fetch the base or fix the
 *         checkout.
 */
function declaredProofTests(): string[] {
	// First, confirm the versioned directory exists at all. If it does not,
	// the repo has no proof infrastructure — the step is a no-op.
	if (!existsSync(PROOFS_DIR)) {
		return [];
	}

	// Get the list of files changed by this PR.
	let changedFiles: string[];
	try {
		if (process.env.GITHUB_BASE_REF && process.env.GITHUB_HEAD_REF) {
			const baseRef = `refs/remotes/origin/${process.env.GITHUB_BASE_REF}`;

			// GitHub's checkout action fetches only the PR's own ref. The base
			// branch's remote ref does not exist until we fetch it. Fetch it
			// explicitly so the diff works on a clean CI checkout. Scoped to
			// the single base ref — fast, a few hundred KB at most.
			execSync(
				`git -C "${ROOT}" fetch --depth=1 origin "${process.env.GITHUB_BASE_REF}"`,
				{ encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] },
			);

			const diffOutput = execSync(
				`git -C "${ROOT}" diff --name-only "${baseRef}..HEAD"`,
				{ encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] },
			);
			changedFiles = diffOutput
				.split('\n')
				.map((f) => f.trim())
				.filter((f) => f.length > 0);
		} else {
			// Local development: diff the most recent commit.
			const diffOutput = execSync(
				`git -C "${ROOT}" diff --name-only HEAD~1 HEAD`,
				{ encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] },
			);
			changedFiles = diffOutput
				.split('\n')
				.map((f) => f.trim())
				.filter((f) => f.length > 0);
		}
	} catch (err) {
		// If git diff fails (e.g., fetch-depth limited and base ref not
		// fetched), the operator cannot determine what the PR declared.
		// An unresolvable base must fail LOUD — never become "no proofs
		// declared → exit 0". An input we cannot parse is not replaced by a
		// compliant default.
		throw new Error(
			`git diff failed — cannot determine which proofs this PR declared. ` +
				`Fetch the base ref (e.g., "git fetch origin <base>") and retry. ` +
				`Detail: ${(err as Error).message}`,
		);
	}

	// Every file added or modified under tests/proofs/ is a declared proof.
	// Proof files live under apps/front/tests/proofs/, so the diff paths
	// from the repo root start with "apps/front/tests/proofs/".
	const declared = changedFiles.filter((f) =>
		f.startsWith('apps/front/tests/proofs/'),
	);

	// Return paths relative to apps/front (the working directory).
	return declared.map((p) => p.replace(/^apps\/front\//, ''));
}

/**
 * Validate that a proof-test file is a real, parseable test before handing it
 * to vitest. An empty, binary, or truncated file makes vitest exit 1 with
 * "No test suite found" or a PARSE_ERROR — which the runner would otherwise
 * misread as "the test failed as expected". We catch that here and fail loud
 * naming the file, so a corrupted proof is never silently green.
 */
function validateProofFile(path: string): void {
	const buf = readFileSync(path);

	if (buf.length === 0) {
		throw new Error(`Proof file is empty (0 bytes): ${path}`);
	}

	// A real test file is UTF-8 source. Null bytes signal a binary file
	// (e.g. an image or compiled artifact renamed to .test.ts).
	if (buf.includes(0)) {
		throw new Error(`Proof file contains null bytes (binary?): ${path}`);
	}

	const content = buf.toString('utf-8');

	// A proof test must actually declare at least one test case. A truncated
	// file, a YAML-accident, or a non-test file renamed to .test.ts won't.
	if (!/(?:^|\s)(?:test|it|describe)\s*\(/.test(content)) {
		throw new Error(
			`Proof file declares no test/it/describe (truncated? not a test?): ${path}`,
		);
	}
}

/**
 * Determine if a filename ends with one of the replayable extensions.
 * Uses exact suffix matching (not last-dot slicing) so multi-dot
 * extensions like `.test.ts` and `.test.tsx` are recognized correctly.
 */
function isReplayableFile(filename: string): boolean {
	return REPLAYABLE_EXTENSIONS.some((ext) => filename.endsWith(ext));
}

// --- Main logic ---

// Confirm the versioned directory exists. If it does not, the repo has no
// proof infrastructure — the step is a no-op.
if (!existsSync(PROOFS_DIR)) {
	console.log('No paired red proof tests found in tests/proofs/.');
	console.log('This step is a no-op for PRs that do not declare a paired red proof.');
	console.log('To declare one, add a file under apps/front/tests/proofs/<issue>/.');
	process.exit(0);
}

// Determine what this PR declared. This can throw if git diff fails — let it
// propagate so the step fails loud rather than silently turning green.
const declared = declaredProofTests();

if (declared.length === 0) {
	// Proofs exist in the repo, but this PR did not declare any.
	console.log(
		'This PR did not declare any paired red proofs (no proof files added or modified).',
	);
	console.log(
		'Proof tests are versionned under tests/proofs/; this PR did not touch any of them.',
	);
	console.log('This step is an explicit no-op for PRs that do not declare a proof.');
	process.exit(0);
}

// The PR declared proofs — validate each one is replayable.
const replayable: string[] = [];
const unReplayable: string[] = [];

for (const test of declared) {
	if (isReplayableFile(test)) {
		replayable.push(test);
	} else {
		unReplayable.push(test);
	}
}

// A declared proof the guard cannot replay MUST fail the step loud. This is
// the load-bearing check: it is what makes the guard monitor its own
// integrity. If the runner's replay config cannot execute a declared file,
// the author must either make the file replayable or remove it — not ignore
// it.
if (unReplayable.length > 0) {
	console.error(
		`The PR declared ${declared.length} proof file(s), but ${unReplayable.length} of them cannot be replayed by the runner.`,
	);
	console.error(
		`Replayable extensions are: ${REPLAYABLE_EXTENSIONS.join(', ')}. ` +
			`Declare only proof files with these extensions.`,
	);
	console.error('UnReplayable declared proofs:');
	for (const t of unReplayable) {
		console.error(`  ${t}`);
	}
	console.error(
		'A declared proof the guard cannot replay is a blind spot, not a no-op. ' +
			'Fix the extension or remove the file from the PR.',
	);
	process.exit(1);
}

// All declared proofs are replayable — replay them with inverted semantics.
console.log(
	`This PR declared ${replayable.length} paired red proof(s) — replaying with inverted semantics:\n`,
);
for (const t of replayable) {
	console.log(`  ${t}`);
}
console.log();

let failures = 0; // proof tests that failed as expected (good)
let unexpectedPasses = 0;
let corrupted = 0;

for (const test of replayable) {
	// Validate BEFORE running: distinguishes "test failed as expected" from
	// "file could not be parsed" — the latter must fail loud naming the file.
	try {
		validateProofFile(test);
	} catch (err) {
		console.error(`  CORRUPT PROOF: ${(err as Error).message}`);
		corrupted++;
		continue;
	}

	console.log(`--- Running: ${test} ---`);
	try {
		execFileSync('pnpm', ['exec', 'vitest', 'run', '--config', CONFIG, '--no-color', test], {
			stdio: 'pipe',
			encoding: 'utf-8',
		});
		// If execFileSync did NOT throw, vitest exited 0 = the test passed.
		console.error(
			`  FAIL: proof test passed unexpectedly — the bug it documented may have changed form.\n  Test: ${test}`,
		);
		unexpectedPasses++;
	} catch (err) {
		const error = err as { stdout?: Buffer; stderr?: Buffer; status?: number };
		const stdout = (error.stdout?.toString() ?? '').slice(0, 500);
		const stderr = (error.stderr?.toString() ?? '').slice(0, 500);
		const exitCode = error.status ?? 'unknown';

		// vitest exits 1 both when tests fail (expected) AND when a file
		// cannot be parsed (unexpected). Distinguish by looking for the
		// "Tests N failed" marker — a real failing test reports a non-zero
		// test count. validateProofFile already caught empty/truncated files;
		// this is a backstop for any case that slips through.
		const output = stdout + stderr;
		const ranTests = /Tests\s+\d+\s+failed/.test(output) && !/Tests\s+no tests/.test(output);
		const noTests = /Tests\s+no tests/.test(output) || /\(0 test\)/.test(output);

		// A kept-red proof is EXPECTED TO FAIL on an ASSERTION
		// (`AssertionError: expected false to be true`). It is NOT expected
		// to fail because it THREW an Error. Two distinct failure modes that
		// both produce "Tests 1 failed":
		//   - assertion failure → the proof measured and the ideal is not met
		//     (kept-red, the expected state) → success.
		//   - thrown Error (MESURE IMPOSSIBLE, harness crash, extraction
		//     failure) → the proof could NOT measure. This is NOT the
		//     expected kept-red state — it is a broken measurement, and it
		//     must FAIL THE STEP LOUD rather than be reported as "failed as
		//     expected". Otherwise a mutation that makes the proof throw
		//     (e.g. bracket-notation `process['on']` that the regex can't
		//     match) keeps CI green while the guard is blind.
		// We discriminate by checking for the AssertionError marker. vitest
		// prints "AssertionError" for assertion failures and "Error" for
		// thrown errors. A proof that fails without an AssertionError in
		// its output is a measurement failure, not a kept-red success.
		const hasAssertionFailure = /AssertionError/.test(output);
		const hasMeasurementError = /MESURE IMPOSSIBLE/.test(output);

		if (exitCode === 1 && ranTests && hasAssertionFailure && !hasMeasurementError) {
			console.log(`  OK: proof test failed as expected (exit code 1).\n`);
			failures++;
		} else if (exitCode === 1 && ranTests && (!hasAssertionFailure || hasMeasurementError)) {
			console.error(
				`  CORRUPT PROOF: proof test failed with a non-assertion error ` +
					`(measurement impossible or harness crash), not the expected assertion failure.\n` +
					`  A kept-red proof must fail on an assertion (expected X to be Y), ` +
					`  not on a thrown Error. A thrown Error means the proof could not measure ` +
					`  — this is NOT the expected kept-red state and must fail CI.\n` +
					`  stdout: ${stdout.slice(0, 500)}\n  stderr: ${stderr.slice(0, 500)}`,
			);
			corrupted++;
		} else if (exitCode === 1 && noTests) {
			console.error(
				`  CORRUPT PROOF: vitest found no test cases in ${test} (empty/truncated/not a test).\n  stdout: ${stdout.slice(0, 500)}\n  stderr: ${stderr.slice(0, 500)}`,
			);
			corrupted++;
		} else {
			console.error(
				`  ERROR: proof test exited with unexpected code ${exitCode}.\n  stdout: ${stdout.slice(0, 500)}\n  stderr: ${stderr.slice(0, 500)}`,
			);
			unexpectedPasses++;
		}
	}
}

console.log(`\n=== Summary ===`);
console.log(`  Proof tests failed as expected: ${failures}`);
console.log(`  Proof tests passed unexpectedly:  ${unexpectedPasses}`);
console.log(`  Corrupt/unparseable proof files:  ${corrupted}`);

if (unexpectedPasses > 0 || corrupted > 0) {
	console.error(`\nFAIL: proof replay did not complete cleanly.`);
	if (unexpectedPasses > 0) {
		console.error(`  ${unexpectedPasses} proof test(s) passed when they should have failed.`);
		console.error(
			'A proof test passing means the bug it documented has been fixed or changed form.',
		);
	}
	if (corrupted > 0) {
		console.error(
			`  ${corrupted} proof file(s) could not be parsed — they are empty, binary, or truncated.`,
		);
	}
	console.error(
		'Rebuild the proof: update the test assertion to match the current bug, or remove it if the bug is fixed.',
	);
	process.exit(1);
}

console.log('\nAll declared proof tests behaved as expected.');
process.exit(0);
