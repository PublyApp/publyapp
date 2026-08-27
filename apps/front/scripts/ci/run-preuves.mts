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
 *   - If NO proof tests exist  → success (no-op; .dump/ is git-ignored and
 *                                 absent in CI checkouts).
 *
 * This lets CI catch the case where a proof test silently goes green — exactly
 * the failure mode issue #1659 warns about ("a pasted output is not replayable").
 */
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

const PREUVES_DIR = join(process.cwd(), '.dump', 'preuves');
const CONFIG = 'vitest.preuves.config.ts';

function findPreuveTests(): string[] {
	try {
		const dirs = readdirSync(PREUVES_DIR, { withFileTypes: true });
		const results: string[] = [];
		for (const dir of dirs) {
			if (!dir.isDirectory()) continue;
			const issueDir = join(PREUVES_DIR, dir.name);
			try {
				const files = readdirSync(issueDir, { withFileTypes: true });
				for (const file of files) {
					if (file.isFile() && file.name.endsWith('.test.ts')) {
						results.push(join('.dump', 'preuves', dir.name, file.name));
					}
				}
			} catch {
				// issue dir not readable or empty — skip
			}
		}
		return results;
	} catch {
		return [];
	}
}

const tests = findPreuveTests();

if (tests.length === 0) {
	console.log(
		'No proof tests under .dump/preuves/ — nothing to verify (CI checkout has no .dump/).',
	);
	process.exit(0);
}

console.log(
	`Running ${tests.length} proof test(s) — each is EXPECTED TO FAIL:\n`,
);
for (const t of tests) {
	console.log(`  ${t}`);
}
console.log();

let failures = 0;
let unexpectedPasses = 0;

for (const test of tests) {
	console.log(`--- Running: ${test} ---`);
	try {
		// Run a single proof test via vitest. We expect it to fail.
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

		// vitest exits with code 1 when tests fail. That is our EXPECTED outcome.
		if (exitCode === 1) {
			console.log(`  OK: proof test failed as expected (exit code 1).\n`);
			failures++;
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

if (unexpectedPasses > 0) {
	console.error(
		`\nFAIL: ${unexpectedPasses} proof test(s) passed when they should have failed.`,
	);
	console.error(
		'A proof test passing means the bug it documented has been fixed or changed form.',
	);
	console.error(
		'Rebuild the proof: update the test assertion to match the current bug, or remove it if the bug is fixed.',
	);
	process.exit(1);
}

console.log('\nAll proof tests behaved as expected.');
process.exit(0);
