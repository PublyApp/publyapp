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
 * ## Option (b) — declaration-scoped replay (issue #1659, ronde 5)
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
 * The developer replay path is `just test-preuves` (lane worktree where .dump/
 * also exists for traces). CI runs the same command on a clean checkout.
 *
 * ## Why not (a) or (c)?
 * See .dump/DONE-1687-r5.md for the full rationale.
 */
import { execFileSync, execSync } from 'node:child_process';
import { type Dirent, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(process.cwd(), '..'); // apps/front → repo root
const PROOFS_DIR = join(process.cwd(), 'tests', 'proofs');
const CONFIG = 'vitest.preuves.config.ts';

/**
 * Determine which proof files were declared by the current PR.
 *
 * In CI, GITHUB_BASE_REF and GITHUB_HEAD_REF are available. We use a
 * three-dot diff (refs/remotes/origin/<base>...HEAD) so only PR-introduced
 * changes are listed, not files that diverged on the base branch.
 *
 * Locally (no env vars), we use two-dot diff (HEAD~1..HEAD) to show what the
 * most recent commit introduced.
 *
 * Returns the list of proof-test paths (relative to apps/front) that were
 * added or modified in the diff, or null when the repo has zero proof files.
 */
function declaredProofTests(): string[] | null {
	// Find all proof test files in the versioned directory.
	const allProofs = findProofFiles();

	if (allProofs.length === 0) {
		return null; // No proofs in the repo at all.
	}

	// Get the list of files changed by this PR.
	//
	// In CI (GITHUB_BASE_REF + GITHUB_HEAD_REF set): use three-dot diff
	// (base...HEAD) so only PR-introduced changes are listed — not files
	// that diverged on the base branch. This is the standard GitHub Actions
	// pattern for detecting what a PR changed.
	//
	// Locally (no env vars): use two-dot diff (HEAD~1..HEAD) to show what
	// the most recent commit introduced. This lets a developer verify a
	// proof file that was just committed.
	let changedFiles: string[];
	try {
		if (process.env.GITHUB_BASE_REF && process.env.GITHUB_HEAD_REF) {
			const baseRef = `refs/remotes/origin/${process.env.GITHUB_BASE_REF}`;
			const diffOutput = execSync(
				`git -C "${ROOT}" diff --name-only "${baseRef}...HEAD"`,
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
	} catch {
		// If git diff fails (e.g., no previous commit), treat as no declarations.
		return [];
	}

	// Find proof files that were added or modified by this PR.
	// Proof files live under apps/front/tests/proofs/, so the diff paths
	// from the repo root will start with "apps/front/tests/proofs/".
	const proofPaths = allProofs.map((p) =>
		join('apps/front', p).replace(/\\/g, '/'),
	);

	const declared = proofPaths.filter((proofPath) =>
		changedFiles.includes(proofPath),
	);

	// Return paths relative to apps/front (the working dir).
	return declared.map((p) => p.replace(/^apps\/front\//, ''));
}

/**
 * Find all proof test files in the versioned tests/proofs/ directory.
 * Returns paths relative to apps/front (e.g., "tests/proofs/1613/name.test.ts").
 */
function findProofFiles(): string[] {
	let dirents: Dirent[];
	try {
		dirents = readdirSync(PROOFS_DIR, { withFileTypes: true });
	} catch {
		throw new Error(
			`tests/proofs/ is absent or unreadable: the versioned proofs directory must exist at apps/front/tests/proofs/`,
		);
	}

	const results: string[] = [];
	for (const dir of dirents) {
		if (!dir.isDirectory()) continue;
		const issueDir = join(PROOFS_DIR, dir.name);
		let files: Dirent[];
		try {
			files = readdirSync(issueDir, { withFileTypes: true });
		} catch (err) {
			throw new Error(
				`Cannot read issue directory ${issueDir}: ${(err as Error).message}`,
			);
		}
		for (const file of files) {
			if (file.isFile() && /\.test\.tsx?$/.test(file.name)) {
				results.push(join('tests', 'proofs', dir.name, file.name));
			}
		}
	}
	return results;
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

// --- Main logic ---

const declared = declaredProofTests();

if (declared === null) {
	// No proofs in the repo at all.
	console.log('No paired red proof tests found in tests/proofs/.');
	console.log('This step is a no-op for PRs that do not declare a paired red proof.');
	console.log('To declare one, add a file under apps/front/tests/proofs/<issue>/.');
	process.exit(0);
}

if (declared.length === 0) {
	// Proofs exist in the repo, but this PR did not declare any.
	const allProofs = findProofFiles();
	console.log(
		`This PR did not declare any paired red proofs (no proof files added or modified).`,
	);
	console.log(
		`Proof tests are versionned under tests/proofs/ (${allProofs.length} file(s) in the repo); this PR did not touch any of them.`,
	);
	console.log('This step is an explicit no-op for PRs that do not declare a proof.');
	process.exit(0);
}

// The PR declared proofs — replay them with inverted semantics.
console.log(
	`This PR declared ${declared.length} paired red proof(s) — replaying with inverted semantics:\n`,
);
for (const t of declared) {
	console.log(`  ${t}`);
}
console.log();

let failures = 0; // proof tests that failed as expected (good)
let unexpectedPasses = 0;
let corrupted = 0;

for (const test of declared) {
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
		// "Tests N failed" marker — a real failing test reports a non-zero
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

console.log('\nAll declared proof tests behaved as expected.');
process.exit(0);
