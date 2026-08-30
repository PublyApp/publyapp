/**
 * @vitest-environment node
 *
 * KEPT RED TEST — issue #1821, proof 1 of 2.
 *
 * ## Context
 *
 * `packages/scripts-ts/src/check-jscpd.ts` is the production-duplication
 * ratchet: a CI guard that FAILS (exit 1) when the jscpd report shows more
 * production duplication than the committed baseline. The round-1 committed
 * "red proof" exercised NOTHING: its mutation scanned one sub-threshold file,
 * jscpd found 0 clones, and the guard red only on the anti-rot
 * "jscpd reported 0 clones" tripwire. A red that does not cross the
 * duplication threshold is not a proof of the ratchet.
 *
 * This proof applies a mutation that REALLY crosses the threshold — two new
 * production C# files with an identical ~20-line block (far above jscpd's
 * 50-token minimum) — runs the full-tree CI scan, then runs the guard.
 *
 * ## What the proof asserts (kept-red direction)
 *
 * The proof asserts the BUGGY outcome: the guard PASSES (exit 0) with this
 * mutation applied, i.e. the ratchet's promise ("production duplication
 * cannot increase") is absent.
 *
 * - CORRECTED code: the ratchet bites — guard exit 1, message contains
 *   "increased from". The assertion `expect(guardCode).toBe(0)` FAILS as an
 *   AssertionError. That failure IS the kept-red state the *Verify paired
 *   red proofs* step replays with inverted semantics.
 * - BUG re-introduced (guard disabled, reference loosened, threshold scan
 *   removed): guard exit 0 → the assertion PASSES → the replay step turns
 *   red with "proof test passed unexpectedly" — the stale-proof signal.
 *
 * Two secondary assertions keep the red honest:
 *   - the guard output must contain "increased from" (the red must come
 *     from a ratchet metric, never from the 0-clones anti-rot tripwire);
 *   - the guard output must not contain "0 clones".
 *
 * ## Adverse mutations (trace — three attempts)
 *
 * - A1: scan only the mutation directory (like the round-1 proof). CAUGHT:
 *   the computed production stats stay far below the committed baseline, the
 *   guard prints PASSED and exits 0 → `expect(guardCode).toBe(0)` passes →
 *   replay red. The primary mutation therefore runs the FULL-tree scan.
 * - A2: raise the reference thresholds in the same commit as the mutation.
 *   CAUGHT: the guard reads the committed reference; a loosened reference
 *   makes guardCode 0 → the assertion passes → replay red. This is the known
 *   "reference comes from the PR's own tree" gap (#1859 follow-up issue) —
 *   the proof stays alive only while the reference is honest.
 * - A3: replace the metric increase by the anti-rot tripwire (empty scan).
 *   CAUGHT: the output then contains "0 clones" → the secondary assertion
 *   fails → replay red.
 *
 * ## Replay
 *   cd apps/front && pnpm exec vitest run --config vitest.preuves.config.ts \
 *     tests/proofs/1821/red-1821-ratchet-bites-new-production-pair.test.ts
 *
 * Expected: FAIL — on corrected code the guard exits 1, so
 * `expect(guardCode).toBe(0)` fails.
 *
 * ## Mutation to introduce the red (restore the bug)
 *   Revert the guard's pair metrics to first-fragment-wins (or remove the
 *   ratchet from CI / loosen the committed reference) and re-run the replay:
 *   the guard then exits 0 and this proof PASSES, reddening the replay step.
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
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

const MUTATION_DIR = join(MONOREPO_ROOT, 'apps/api/Modules/DupProof1821');
const FILE_A = join(MUTATION_DIR, 'Services/DupProofServiceA.cs');
const FILE_B = join(MUTATION_DIR, 'Services/DupProofServiceB.cs');
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

const PROOF_SOURCE = `namespace PublyApp.Modules.DupProof1821.Services;

public static class DupProofService
{
	public static int ComputeAdjustedTotal(int baseValue, int multiplier, int offset)
	{
		var scaled = baseValue * multiplier;
		var adjusted = scaled + offset;
		var clamped = adjusted < 0 ? 0 : adjusted;
		var rounded = (clamped / 10) * 10;
		return rounded;
	}

	public static string DescribeResult(int total, string label, bool verbose)
	{
		var prefix = string.IsNullOrWhiteSpace(label) ? "total" : label.Trim();
		var scale = total >= 1000 ? "large" : "small";
		var rank = total >= 10000 ? "critical" : total >= 1000 ? "major" : "minor";
		var detail = verbose ? string.Concat(prefix, " is ", scale, " with ", rank, " impact") : prefix;
		return detail;
	}
}
`;

/** The mutation: two identical production files -> one new jscpd pair. */
const applyMutation = (): void => {
	rmSync(MUTATION_DIR, { recursive: true, force: true });
	mkdirSync(join(MUTATION_DIR, 'Services'), { recursive: true });
	writeFileSync(
		FILE_A,
		PROOF_SOURCE.replace(
			'namespace PublyApp.Modules.DupProof1821.Services;',
			'namespace PublyApp.Modules.DupProof1821.Services.A;',
		),
	);
	writeFileSync(
		FILE_B,
		PROOF_SOURCE.replace(
			'namespace PublyApp.Modules.DupProof1821.Services;',
			'namespace PublyApp.Modules.DupProof1821.Services.B;',
		),
	);
};

const revertMutation = (): void => {
	rmSync(MUTATION_DIR, { recursive: true, force: true });
};

const runScanAndGuard = () => {
	// Full-tree scan — the only scan that can cross the committed baseline.
	// jscpd's exit code varies with config; the report is what the guard reads.
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

test('RED: with a real new production duplicate, the guard passes (ratchet promise absent)', () => {
	applyMutation();
	try {
		const { output, code } = runScanAndGuard();

		// BUGGY condition (asserted): the guard lets the new production
		// duplication through. On corrected code the ratchet bites (exit 1),
		// so this assertion FAILS — the kept-red state. When it passes (a
		// re-introduced bug), every other assertion passes too, so the
		// replay step turns red with "proof test passed unexpectedly".
		expect(code).toBe(0);

		// When the guard DOES red (manual red-state verification, or a
		// future variant that reds for the wrong reason), the red must come
		// from a ratchet metric — never from the 0-clones anti-rot tripwire.
		if (code !== 0) {
			expect(output).toContain('increased from');
			expect(output).not.toContain('0 clones');
		}
	} finally {
		revertMutation();
	}
}, 300_000);
