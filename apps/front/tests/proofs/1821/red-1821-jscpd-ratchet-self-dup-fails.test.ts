/**
 * @vitest-environment node
 *
 * KEPT RED TEST — issue #1821, proof 3 of 3.
 *
 * ## Context
 *
 * Round 1 of PR #1859 found that self-duplication growth inside one file was
 * invisible: `computeProductionStats` kept the MAX duplicate fragment per
 * file, so adding a second identical block to an already-self-duplicated
 * production file did not move the metric when the new fragment was smaller
 * than the existing max. Measured: `create-hooks.ts` has 15 self-dup
 * fragments ([13,10,49,14,15,34,15,23,40,21,23,12,40,21,8] = 338 dup lines,
 * exactly the issue's number) yet max-wins counting reported only 49.
 *
 * The fix: EVERY self-dup fragment in a file sums, so one more identical
 * block moves the metric.
 *
 * This proof appends TWO identical methods to an already-self-duplicated
 * production file (`InvitationAcceptanceService.cs`, 103 baseline dup
 * lines), runs the full-tree CI scan, then runs the guard.
 *
 * ## What the proof asserts (kept-red direction)
 *
 * The proof asserts the BUGGY outcome: the guard PASSES (exit 0) with this
 * mutation applied, i.e. the extra self-dup fragment inside the file is
 * invisible.
 *
 * - CORRECTED code: the file's self-dup lines grow, the guard exits 1 with
 *   "increased from". `expect(guardCode).toBe(0)` FAILS as an AssertionError
 *   — the kept-red state the *Verify paired red proofs* step replays with
 *   inverted semantics.
 * - BUG re-introduced (max-wins counting restored, or any loosening): guard
 *   exit 0 → the assertion PASSES → the replay step turns red with "proof
 *   test passed unexpectedly" — the stale-proof signal.
 *
 * Secondary assertions: the output must contain "increased from" (the red is
 * a ratchet metric violation, not the 0-clones anti-rot tripwire) and must
 * not contain "0 clones".
 *
 * ## Adverse mutations (trace — three attempts)
 *
 * - C1: append ONE copy only. CAUGHT: a lone copy is not a clone, jscpd
 *   reports nothing new, guard stays 0 → the assertion passes → replay red.
 *   The primary mutation appends TWO identical copies.
 * - C2: append the copies below the 50-token minimum. CAUGHT: jscpd does
 *   not detect them, the metric does not move, guard exits 0 → assertion
 *   passes → replay red. The appended method is ~18 lines, well above the
 *   minimum.
 * - C3: loosen the committed reference in the same commit. CAUGHT: guard
 *   exits 0 → assertion passes → replay red (the known "reference from the
 *   PR's own tree" gap, tracked as the #1859 follow-up issue).
 *
 * ## Replay
 *   cd apps/front && pnpm exec vitest run --config vitest.preuves.config.ts \
 *     tests/proofs/1821/red-1821-jscpd-ratchet-self-dup-fails.test.ts
 *
 * Expected: FAIL — on corrected code the guard exits 1, so
 * `expect(guardCode).toBe(0)` fails.
 *
 * ## Mutation to introduce the red (restore the bug)
 *   Revert the auto metric to max-fragment-wins and re-run the replay: the
 *   guard then exits 0 and this proof PASSES, reddening the replay step.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test } from 'vitest';

// apps/front/tests/proofs/1821/<this file> -> monorepo root is 5 levels up.
const __filename = fileURLToPath(import.meta.url);
const MONOREPO_ROOT = resolve(
	dirname(__filename),
	'..',
	'..',
	'..',
	'..',
	'..',
);

// Already self-duplicated in the baseline (103 dup lines): a NEW identical
// block here must move the auto metric.
const TARGET_FILE = join(
	MONOREPO_ROOT,
	'apps/api/Modules/Invitations/Services/InvitationAcceptanceService.cs',
);
const TARGET_REPO_PATH = TARGET_FILE.slice(MONOREPO_ROOT.length + 1);

const REPORT_PATH = join(
	MONOREPO_ROOT,
	'.dump/jscpd-report.json/jscpd-report.json',
);
const REF_PATH = join(
	MONOREPO_ROOT,
	'packages/scripts-ts/src/jscpd-reference.json',
);
const GUARD_PATH = join(
	MONOREPO_ROOT,
	'packages/scripts-ts/src/check-jscpd.ts',
);

// The exact CI exclusion list (single comma-separated --ignore value — see
// check-jscpd.ts header: repeated --ignore flags silently drop all but the
// last, measured in #1859 round 2).
const IGNORE_LIST =
	'/node_modules/**,/bin/**,/obj/**,/dist/**,/.artifacts/**,' +
	'**/Migrations/**,.worktrees/**,packages/client-ts/**,apps/front/scripts/**';

// ~18 lines, well above jscpd's 50-token minimum. Two identical copies are
// appended so they clone with each other.
const APPENDED_METHOD = `
	public static string DescribeLevelRank(int level, bool optIn, string scope)
	{
		var bucket = level >= 10 ? "senior" : level >= 5 ? "mid" : "junior";
		var label = optIn ? "opted" : "standard";
		var fullLabel = string.IsNullOrWhiteSpace(scope) ? "account" : scope.Trim();
		var combined = string.Concat(bucket, "/", label, "@", fullLabel);
		var padded = combined.Length > 24 ? combined.Substring(0, 24) : combined;
		return padded;
	}
`;

/** The mutation: append two identical methods to the self-duplicated file. */
const applyMutation = (): void => {
	const src = readFileSync(TARGET_FILE, 'utf-8');
	if (!src.trimEnd().endsWith('}')) {
		throw new Error(
			`MESURE IMPOSSIBLE — ${TARGET_FILE} no longer ends with '}'`,
		);
	}
	const body = src.trimEnd().slice(0, -1).trimEnd();
	writeFileSync(
		TARGET_FILE,
		body + APPENDED_METHOD + APPENDED_METHOD + '\n}\n',
	);
};

/** Restore the target file from git (the mutation overwrote the bytes). */
const restoreFromGit = (): void => {
	execFileSync('git', ['checkout', '--', TARGET_REPO_PATH], {
		cwd: MONOREPO_ROOT,
		stdio: 'pipe',
		timeout: 30_000,
	});
};

const runScanAndGuard = () => {
	try {
		execFileSync(
			'pnpm',
			[
				'exec',
				'jscpd',
				'.',
				'--min-tokens',
				'50',
				'--ignore',
				IGNORE_LIST,
				'--reporters',
				'json',
				'--output',
				'.dump/jscpd-report.json',
			],
			{ cwd: MONOREPO_ROOT, stdio: 'pipe', timeout: 300_000 },
		);
	} catch {
		// jscpd can exit non-zero on clone detection; the report is what counts.
	}

	let output = '';
	let code = 0;
	try {
		output = execFileSync('node', [GUARD_PATH, REPORT_PATH, REF_PATH], {
			cwd: MONOREPO_ROOT,
			encoding: 'utf-8',
			stdio: 'pipe',
			timeout: 30_000,
		});
	} catch (err: unknown) {
		const std = err as { stdout?: Buffer; stderr?: Buffer; status?: number };
		output = [std.stdout, std.stderr]
			.filter((part): part is Buffer => part !== undefined)
			.map((part) => part.toString())
			.join('');
		code = std.status ?? 1;
	}
	return { output, code };
};

test('RED: a new self-dup fragment inside an already-self-duplicated file leaves the guard green (buggy counting)', () => {
	applyMutation();
	try {
		const { output, code } = runScanAndGuard();

		// BUGGY condition (asserted): the extra self-dup fragment is
		// invisible (max-fragment-wins). On corrected code the file's
		// self-dup lines sum and the guard exits 1 — so this assertion
		// FAILS, the kept-red state. When it passes (a re-introduced bug),
		// every other assertion passes too, so the replay step turns red
		// with "proof test passed unexpectedly".
		expect(code).toBe(0);

		// When the guard DOES red (manual red-state verification, or a
		// future variant that reds for the wrong reason), the red must come
		// from a ratchet metric — never from the 0-clones anti-rot tripwire.
		if (code !== 0) {
			expect(output).toContain('increased from');
			expect(output).not.toContain('0 clones');
		}
	} finally {
		restoreFromGit();
	}
}, 300_000);
