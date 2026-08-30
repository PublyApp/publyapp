/**
 * consume-verdict.mts — pure dispatch of a classification verdict onto the
 * four counters the runner maintains.
 *
 * The `switch` in run-preuves.mts that consumes `classifyProof`'s verdict and
 * decides which counter to increment is the load-bearing decision point of the
 * guard: misclassifying a verdict here is exactly the defect class #1784 was
 * designed to eliminate (a crashed vitest process → `ERROR` verdict → counted
 * as an expected failure, a silent green that measured nothing).
 *
 * This module factors that decision into a PURE function so it can be unit-
 * tested independently — the same extraction that classifyProof itself
 * underwent in #1813. The function returns the counter to increment; the caller
 * applies the side effect (the increment itself and the log line). Keeping the
 * decision pure and the effect in run-preuves.mts means a test can feed a real
 * `ClassificationResult` and assert the counter — no mocking, no stdout capture.
 *
 * ## Separating stale proofs from corrupt files (#1806, ronde 9)
 *
 * The r7/r8 code conflated two distinct failure classes under a single
 * `corrupted` counter:
 *
 * 1. "Declared red test PASSED" — the proof's assertion flipped green because
 *    the bug it documented was changed or weakened (a paired mutation, or a
 *    production regression that closed the bug). The proof FILE is fine; its
 *    CLAIM is stale.
 * 2. "Corrupt/unparseable proof file" — the file is empty, binary, truncated,
 *    or the vitest JSON report is unreadable. The proof CANNOT measure.
 *
 * Both mean "CI red", but they demand DIFFERENT operator responses:
 *  - stale proof → rewrite the test to match the current bug (or remove it if
 *    the bug is truly fixed).
 *  - corrupt file → recover the file (it lost content) or fix the report path.
 *
 * Folding them into one counter made the summary say "1 corrupt/unparseable
 * proof file" when the real failure was "a declared kept-red test went green"
 * — a false cause that sends the operator hunting for a corrupted file that is
 * perfectly readable. This module splits them into two counters — `stale` for
 * case 1, `corrupted` for case 2 — so the summary names the real defect.
 */

import type { ClassificationResult } from './classify-proof.mts';

/**
 * The four counters the runner maintains. A verdict maps to exactly one of
 * them. The mapping is the entire point of this module:
 *
 * - `OK`                  → the proof failed on an assertion (kept-red, expected) → failures
 * - `CORRUPT PROOF`       → thrown Error / measurement impossible               → corrupted
 * - `NO_TESTS`            → vitest found no test cases                        → corrupted
 * - `UNEXPECTED_PASS`     → the proof passed when it should have failed    → unexpectedPasses
 * - `ERROR`               → unexpected exit code (crash, non-zero non-one)   → unexpectedPasses
 * - `DECLARED RED PASSED` → a declared kept-red test passed (proof is stale) → stale
 */
export type Counter = 'failures' | 'unexpectedPasses' | 'corrupted' | 'stale';

/**
 * Map a classification verdict to the counter it must increment.
 *
 * This is the pure decision the `switch` in run-preuves.mts makes. Extracted
 * here so a test can assert each mapping directly, and so the adverse mutation
 * the brief demands — swapping two branches — turns a named test red.
 *
 * @param verdict The verdict from `classifyProof`.
 * @returns The counter that must be incremented for this verdict.
 */
export const counterForVerdict = (
	verdict: ClassificationResult['verdict'],
): Counter => {
	switch (verdict) {
		case 'OK':
			return 'failures';
		case 'CORRUPT PROOF':
			return 'corrupted';
		case 'NO_TESTS':
			return 'corrupted';
		case 'UNEXPECTED_PASS':
			return 'unexpectedPasses';
		case 'ERROR':
			return 'unexpectedPasses';
		case 'DECLARED RED PASSED':
			return 'stale';
	}
};

/**
 * Consume a classification result by incrementing the counter it maps to.
 *
 * Pure function: given the current counts and a verdict, returns the next
 * counts. No side effects — the caller decides what to log or print. This is
 * the unit-testable core: a test feeds a verdict and asserts the resulting
 * counts without capturing stdout or mocking anything.
 *
 * @param counts   The current counter values.
 * @param verdict  The verdict from `classifyProof`.
 * @returns The next counter values (a new object — input is never mutated).
 */
export type ProofCounts = {
	failures: number;
	unexpectedPasses: number;
	corrupted: number;
	stale: number;
};

export const consumeVerdict = (
	counts: ProofCounts,
	verdict: ClassificationResult['verdict'],
): ProofCounts => {
	const counter = counterForVerdict(verdict);
	return {
		failures: counts.failures + (counter === 'failures' ? 1 : 0),
		unexpectedPasses:
			counts.unexpectedPasses + (counter === 'unexpectedPasses' ? 1 : 0),
		corrupted: counts.corrupted + (counter === 'corrupted' ? 1 : 0),
		stale: counts.stale + (counter === 'stale' ? 1 : 0),
	};
};

/**
 * The exit-gate predicate of the runner (issue #1806, ronde 11). The runner
 * MUST exit non-zero when ANY of the three red counters is non-zero — a
 * stale proof ALONE (a declared kept-red test went green, with
 * `unexpectedPasses == 0` and `corrupted == 0`) is enough to fail CI. The
 * `stale` term is the only carrier of the declared-red-passed signal, so it
 * must be pinned by a named test: this predicate is unit-tested in
 * consume-verdict.test.ts, and the process-launch regression in
 * run-preuves.test.ts proves the REAL script exits non-zero when only
 * `stale > 0`.
 *
 * `failures` (kept-red proofs that failed as expected) is NOT a failure:
 * it never trips the gate.
 *
 * @param counts The counter values after the replay loop.
 * @returns True when the runner must exit non-zero.
 */
export const gateShouldFail = (counts: ProofCounts): boolean =>
	counts.unexpectedPasses > 0 || counts.stale > 0 || counts.corrupted > 0;
