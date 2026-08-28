#!/usr/bin/env node
/*
 * run-preuves.mts — executes the kept-red proof tests under .dump/preuves/.
 *
 * Each proof test in this repo is EXPECTED TO FAIL. It proves a bug is present
 * by asserting the ideal behavior against the corrected code — the corrected
 * code does NOT satisfy the ideal, so the test fails, and that failure IS the
 * proof.
 *
 * This script inverts the usual pass/fail semantics:
 *
 *   - If a proof test FAILS  → success (the bug is still present, proof intact).
 *   - If a proof test PASSES → FAILURE (the bug has changed form or been fixed;
 *                                the proof is stale and must be rebuilt).
 *   - If NO proof tests exist  → FAILURE (exit 1). .dump/ is git-ignored and
 *                                        absent in CI checkouts, so a green CI
 *                                        step that verified nothing would hide
 *                                        the absence of proof behind a passing
 *                                        check. Failing loud makes the gap
 *                                        visible: the step is red until a proof
 *                                        file is present to replay.
 *
 * The developer replay path is the lane worktree (`just test-preuves`), where
 * .dump/preuves/ exists. CI runs the same command on a clean checkout and gets
 * exit 1 — the honest signal that there is nothing to replay.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const PREUVES_DIR = join(process.cwd(), '.dump', 'preuves');
const CONFIG = 'vitest.preuves.config.ts';

/**
 * Validate that a proof-test file is a real, parseable test before handing it
 * to vitest. An empty, binary, or truncated file makes vitest exit 1 with
 * "No test suite found" or a PARSE_ERROR — which the runner would otherwise
 * misread as "the test failed as expected" (constat A3, ronde 3). We catch
 * that here and fail loud naming the file, so a corrupted proof is never
 * silently green.
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

function findPreuveTests(): string[] {
	let dirents: readdirSync.Dirent[];
	try {
		dirents = readdirSync(PREUVES_DIR, { withFileTypes: true });
	} catch (err) {
		// .dump/preuves/ does not exist (git-ignored, absent in CI). Fail loud
		// below rather than silently returning [] — the old no-op behaviour.
		throw new Error(
			`.dump/preuves/ is absent or unreadable: ${(err as Error).message}`,
		);
	}

	const results: string[] = [];
	for (const dir of dirents) {
		if (!dir.isDirectory()) continue;
		const issueDir = join(PREUVES_DIR, dir.name);
		let files: readdirSync.Dirent[];
		try {
			files = readdirSync(issueDir, { withFileTypes: true });
		} catch (err) {
			// The old runner swallowed this in a bare catch {}. Now it fails
			// loud naming the directory, so a permission problem is not
			// silently skipped.
			throw new Error(
				`Cannot read issue directory ${issueDir}: ${(err as Error).message}`,
			);
		}
		for (const file of files) {
			if (file.isFile() && file.name.endsWith('.test.ts')) {
				results.push(join('.dump', 'preuves', dir.name, file.name));
			}
		}
	}
	return results;
}

let tests: string[];
try {
	tests = findPreuveTests();
} catch (err) {
	console.error(`FAIL: ${(err as Error).message}`);
	console.error(
		'Proof replay requires .dump/preuves/<issue>/<name>.test.ts files, which live in the lane worktree (git-ignored, absent in CI).',
	);
	process.exit(1);
}

if (tests.length === 0) {
	console.error('FAIL: .dump/preuves/ exists but contains no .test.ts proof files.');
	console.error(
		'A green step that verified nothing would hide the absence of proof. Add a proof or remove the step.',
	);
	process.exit(1);
}

console.log(`Running ${tests.length} proof test(s) — each is EXPECTED TO FAIL:\n`);
for (const t of tests) {
	console.log(`  ${t}`);
}
console.log();

let failures = 0;
let unexpectedPasses = 0;
let corrupted = 0;

for (const test of tests) {
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
		execFileSync('pnpm', ['exec', 'vitest', 'run', '--config', CONFIG, test], {
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
		// "Tests no tests" marker — a real failing test reports a non-zero
		// test count. validateProofFile already caught empty/truncated files;
		// this is a backstop for any case that slips through.
		const output = stdout + stderr;
		const ranTests = /Tests\s+\d+\s+failed/.test(output) && !/Tests\s+no tests/.test(output);
		const noTests = /Tests\s+no tests/.test(output) || /\(0 test\)/.test(output);

		if (exitCode === 1 && ranTests) {
			console.log(`  OK: proof test failed as expected (exit code 1).\n`);
			failures++;
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

console.log('\nAll proof tests behaved as expected.');
process.exit(0);
