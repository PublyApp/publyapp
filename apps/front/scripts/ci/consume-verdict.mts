/**
 * consume-verdict.mts — pure dispatch of a classification verdict onto the
 * three counters the runner maintains.
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
 */

import type { ClassificationResult } from './classify-proof.mts';

/**
 * The three counters the runner maintains. A verdict maps to exactly one of
 * them. The mapping is the entire point of this module:
 *
 * - `OK`            → the proof failed on an assertion (kept-red, expected) → failures
 * - `CORRUPT PROOF` → thrown Error / measurement impossible             → corrupted
 * - `NO_TESTS`      → vitest found no test cases                        → corrupted
 * - `UNEXPECTED_PASS` → the proof passed when it should have failed    → unexpectedPasses
 * - `ERROR`         → unexpected exit code (crash, non-zero non-one)   → unexpectedPasses
 */
export type Counter = 'failures' | 'unexpectedPasses' | 'corrupted';

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
	};
};
