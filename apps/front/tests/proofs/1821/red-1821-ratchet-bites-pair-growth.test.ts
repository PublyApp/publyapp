/**
 * @vitest-environment node
 *
 * KEPT RED TEST — issue #1821, proof 2 of 2.
 *
 * ## Context
 *
 * Round 1 of PR #1859 found a counting defect in the jscpd ratchet that the
 * whole issue exists to stop: growth INSIDE an already-paired production
 * pair was invisible. `computeProductionStats` kept the FIRST duplicate
 * fragment per pair (first-wins), so appending one identical method to both
 * `AssignTenantProfilePermissionAsStaff.cs` and
 * `UnassignTenantProfilePermissionAsStaff.cs` added a 16-line fragment to
 * their pair ([42,16,18] -> [42,16,18,16]) while pairCount and pairLines
 * did not move. The guard stayed GREEN and all unit tests passed. That is
 * the accumulation pattern #1821 names (the Update* handler families, the
 * copied error-view files).
 *
 * The fix: EVERY jscpd fragment between two already-paired files adds to that
 * pair's lines (sum), so one more identical block moves the metric.
 *
 * ## What the proof asserts (kept-red direction)
 *
 * The proof applies the exact round-1 mutation (same two files, same style of
 * appended method), runs the full-tree CI scan, then runs the guard. It
 * asserts the BUGGY outcome: the guard PASSES (exit 0), i.e. the extra
 * fragment inside the existing pair is invisible to the ratchet.
 *
 * - CORRECTED code: the pair sums its fragments, pairLines grows, the guard
 *   exits 1 with "increased from". `expect(guardCode).toBe(0)` FAILS as an
 *   AssertionError — the kept-red state the *Verify paired red proofs* step
 *   replays with inverted semantics.
 * - BUG re-introduced (first-fragment-wins counting restored): pairLines do
 *   not move, guard exits 0 → the assertion PASSES → the replay step turns
 *   red with "proof test passed unexpectedly" — the stale-proof signal.
 *
 * Secondary assertions: the output must contain "increased from" (the red is
 * a ratchet metric violation, not the 0-clones anti-rot tripwire) and must
 * not contain "0 clones".
 *
 * ## Adverse mutations (trace — three attempts)
 *
 * - B1: mutate ONE file of the pair only (asymmetric duplicate). CAUGHT:
 *   jscpd reports nothing new (a lone copy is not a clone), guard stays 0 →
 *   the assertion passes → replay red. The primary mutation is SYMMETRIC.
 * - B2: lower the fragment below the 50-token minimum. CAUGHT: jscpd does
 *   not detect it, pairLines do not move, guard exits 0 → assertion passes
 *   → replay red. The primary mutation's method is well above the minimum
 *   (measured: a +14-line / ~60-token fragment).
 * - B3: loosen the committed reference in the same commit. CAUGHT: guard
 *   exits 0 → assertion passes → replay red (the known "reference from the
 *   PR's own tree" gap, tracked as the #1859 follow-up issue).
 *
 * ## Replay
 *   cd apps/front && pnpm exec vitest run --config vitest.preuves.config.ts \
 *     tests/proofs/1821/red-1821-ratchet-bites-pair-growth.test.ts
 *
 * Expected: FAIL — on corrected code the guard exits 1, so
 * `expect(guardCode).toBe(0)` fails.
 *
 * ## Mutation to introduce the red (restore the bug)
 *   Revert the pair counting to first-fragment-wins and re-run the replay:
 *   the guard then exits 0 and this proof PASSES, reddening the replay step.
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

const PAIR_FILES = [
	'apps/api/Modules/Profiles/Handlers/Staff/AssignTenantProfilePermissionAsStaff.cs',
	'apps/api/Modules/Profiles/Handlers/Staff/UnassignTenantProfilePermissionAsStaff.cs',
].map((p) => join(MONOREPO_ROOT, p));
const PAIR_REPO_PATHS = PAIR_FILES.map((p) =>
	p.slice(MONOREPO_ROOT.length + 1),
);

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

// Identical method appended to BOTH files of the pair, just before the final
// class brace — the round-1 mutation shape. ~60 tokens, well above the
// 50-token minimum (measured: a +14-line fragment).
const APPENDED_METHOD = `
	public static string DescribePermission(string action, bool isGranted)
	{
		var verb = isGranted ? "grant" : "revoke";
		var subject = string.IsNullOrWhiteSpace(action) ? "permission" : action.Trim();
		var scope = isGranted ? "tenant profile" : "profile";
		return string.Concat(verb, " ", subject, " on ", scope);
	}
`;

/** The mutation: append the same method to both files. */
const applyMutation = (): void => {
	for (const file of PAIR_FILES) {
		const src = readFileSync(file, 'utf-8');
		if (!src.trimEnd().endsWith('}')) {
			throw new Error(`MESURE IMPOSSIBLE — ${file} no longer ends with '}'`);
		}
		const body = src.trimEnd().slice(0, -1).trimEnd();
		writeFileSync(file, body + APPENDED_METHOD + '\n}\n');
	}
};

/** Restore the pair files from git (the mutation overwrote the bytes). */
const restoreFromGit = (): void => {
	execFileSync('git', ['checkout', '--', ...PAIR_REPO_PATHS], {
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

test('RED: growth inside an already-paired pair leaves the guard green (buggy counting)', () => {
	applyMutation();
	try {
		const { output, code } = runScanAndGuard();

		// BUGGY condition (asserted): the extra fragment inside the pair is
		// invisible (first-fragment-wins). On corrected code the pair sums
		// its fragments, the guard exits 1 — so this assertion FAILS, the
		// kept-red state. When it passes (a re-introduced bug), every other
		// assertion passes too, so the replay step turns red with "proof
		// test passed unexpectedly".
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
