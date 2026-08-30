import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * consume-verdict.test.mts — unit tests for the verdict-to-counter mapping.
 *
 * The `switch` in run-preuves.mts that consumes classifyProof's verdict and
 * decides which counter to increment is the load-bearing decision point of the
 * guard. This test exercises that mapping with REAL vitest JSON reports (not
 * hand-crafted ClassificationResult objects) — the brief's requirement.
 *
 * ## Mutation coverage
 *
 * Each branch permutation is tested by a NAMED test. Swapping any two branches
 * in `counterForVerdict` turns at least one named test red:
 *
 * | Mutation | What it breaks |
 * |----------|---------------|
 * | OK ↔ CORRUPT PROOF | `OK verdict increments failures` OR `CORRUPT PROOF verdict increments corrupted` |
 * | OK ↔ NO_TESTS | `OK verdict increments failures` OR `NO_TESTS verdict increments corrupted` |
 * | OK ↔ UNEXPECTED_PASS | `OK verdict increments failures` OR `UNEXPECTED_PASS verdict increments unexpectedPasses` |
 * | OK ↔ ERROR | `OK verdict increments failures` OR `ERROR verdict increments unexpectedPasses` |
 * | OK ↔ DECLARED RED PASSED | `OK verdict increments failures` OR `DECLARED RED PASSED verdict increments stale` |
 * | CORRUPT PROOF ↔ NO_TESTS | `CORRUPT PROOF verdict increments corrupted` OR `NO_TESTS verdict increments corrupted` (same counter — NOT a distinguishing pair) |
 * | CORRUPT PROOF ↔ UNEXPECTED_PASS | `CORRUPT PROOF verdict increments corrupted` OR `UNEXPECTED_PASS verdict increments unexpectedPasses` |
 * | CORRUPT PROOF ↔ ERROR | `CORRUPT PROOF verdict increments corrupted` OR `ERROR verdict increments unexpectedPasses` |
 * | CORRUPT PROOF ↔ DECLARED RED PASSED | `CORRUPT PROOF verdict increments corrupted` OR `DECLARED RED PASSED verdict increments stale` |
 * | NO_TESTS ↔ UNEXPECTED_PASS | `NO_TESTS verdict increments corrupted` OR `UNEXPECTED_PASS verdict increments unexpectedPasses` |
 * | NO_TESTS ↔ ERROR | `NO_TESTS verdict increments corrupted` OR `ERROR verdict increments unexpectedPasses` |
 * | NO_TESTS ↔ DECLARED RED PASSED | `NO_TESTS verdict increments corrupted` OR `DECLARED RED PASSED verdict increments stale` |
 * | UNEXPECTED_PASS ↔ ERROR | `UNEXPECTED_PASS verdict increments unexpectedPasses` OR `ERROR verdict increments unexpectedPasses` (same counter — NOT a distinguishing pair) |
 * | UNEXPECTED_PASS ↔ DECLARED RED PASSED | `UNEXPECTED_PASS verdict increments unexpectedPasses` OR `DECLARED RED PASSED verdict increments stale` |
 * | ERROR ↔ DECLARED RED PASSED | `ERROR verdict increments unexpectedPasses` OR `DECLARED RED PASSED verdict increments stale` |
 *
 * ## Separating stale from corrupt (#1806, ronde 9)
 *
 * The brief (#1806) demanded splitting the old single `corrupted` counter into
 * two distinct counters:
 *   - `stale`      — a DECLARED RED PASSED verdict (proof's claim is stale).
 *   - `corrupted`  — a CORRUPT PROOF / NO_TESTS verdict (proof FILE is broken).
 *
 * Two refolding mutations that would undo this separation are explicitly
 * guarded:
 *
 * 1. Folding `DECLARED RED PASSED` back into `corrupted` (i.e. making
 *    `counterForVerdict('DECLARED RED PASSED')` return `'corrupted'` instead
 *    of `'stale'`) — caught by `DECLARED RED PASSED verdict increments stale`
 *    AND `CORRUPT PROOF verdict does NOT increment stale`.
 *
 * 2. Folding `corrupted` back into `stale` (i.e. making
 *    `counterForVerdict('CORRUPT PROOF')` return `'stale'` instead of
 *    `'corrupted'`) — caught by `CORRUPT PROOF verdict increments corrupted`
 *    AND `DECLARED RED PASSED verdict does NOT increment corrupted`.
 *
 * Note: CORRUPT PROOF/NO_TESTS both map to `corrupted`, and
 * UNEXPECTED_PASS/ERROR both map to `unexpectedPasses`. Swapping within these
 * pairs does NOT change behavior — they are intentionally coalesced.
 */
import { test, expect } from 'vitest';

import { classifyProof, readProofReport } from './classify-proof.mts';
import {
	consumeVerdict,
	counterForVerdict,
	gateShouldFail,
} from './consume-verdict.mts';

const fixturesDir = fileURLToPath(
	new URL('./__fixtures__/reports/', import.meta.url),
);

/**
 * Load a real vitest JSON report and classify it with the given exit code.
 * This is the load-bearing pattern: a test that hand-crafted a ClassificationResult
 * would verify the switch against a model, not against reality. We feed the chain
 * a real vitest JSON report, exactly as run-preuves.mts does.
 */
const classifyFixture = (file: string, exitCode: number) => {
	const report = readProofReport(join(fixturesDir, file));
	return classifyProof(report, exitCode);
};

// --- Direct counterForVerdict tests (the pure mapping) ---

test('counterForVerdict: OK → failures', () => {
	expect(counterForVerdict('OK')).toBe('failures');
});

test('counterForVerdict: CORRUPT PROOF → corrupted', () => {
	expect(counterForVerdict('CORRUPT PROOF')).toBe('corrupted');
});

test('counterForVerdict: NO_TESTS → corrupted', () => {
	expect(counterForVerdict('NO_TESTS')).toBe('corrupted');
});

test('counterForVerdict: UNEXPECTED_PASS → unexpectedPasses', () => {
	expect(counterForVerdict('UNEXPECTED_PASS')).toBe('unexpectedPasses');
});

test('counterForVerdict: ERROR → unexpectedPasses', () => {
	expect(counterForVerdict('ERROR')).toBe('unexpectedPasses');
});

test('counterForVerdict: DECLARED RED PASSED → stale', () => {
	expect(counterForVerdict('DECLARED RED PASSED')).toBe('stale');
});

// --- consumeVerdict tests with REAL vitest JSON reports ---

test('consumeVerdict: OK verdict (real assertion-failure report) increments failures', () => {
	const result = classifyFixture('ok.json', 1);
	expect(result.verdict).toBe('OK');

	const next = consumeVerdict(
		{ failures: 0, unexpectedPasses: 0, corrupted: 0, stale: 0 },
		result.verdict,
	);
	expect(next).toEqual({
		failures: 1,
		unexpectedPasses: 0,
		corrupted: 0,
		stale: 0,
	});
});

test('consumeVerdict: CORRUPT PROOF verdict (real thrown-Error report) increments corrupted', () => {
	const result = classifyFixture('corrupt.json', 1);
	expect(result.verdict).toBe('CORRUPT PROOF');

	const next = consumeVerdict(
		{ failures: 0, unexpectedPasses: 0, corrupted: 0, stale: 0 },
		result.verdict,
	);
	expect(next).toEqual({
		failures: 0,
		unexpectedPasses: 0,
		corrupted: 1,
		stale: 0,
	});
});

test('consumeVerdict: UNEXPECTED_PASS verdict (real passing test report) increments unexpectedPasses', () => {
	const result = classifyFixture('pass.json', 0);
	expect(result.verdict).toBe('UNEXPECTED_PASS');

	const next = consumeVerdict(
		{ failures: 0, unexpectedPasses: 0, corrupted: 0, stale: 0 },
		result.verdict,
	);
	expect(next).toEqual({
		failures: 0,
		unexpectedPasses: 1,
		corrupted: 0,
		stale: 0,
	});
});

// --- Node 24 AssertionError format regression (predecessor: this used to
//     return CORRUPT PROOF because the classifier only matched the
//     pre-Node-24 "AssertionError:" prefix. Node 24 emits
//     "AssertionError [ERR_ASSERTION]:" — the suffix must be tolerated
//     so an assertion failure is still classified as an assertion
//     failure, not as a thrown Error. This is the regression the
//     scripts-ts paired-proof wiring hit at #1929 r3: the ratchet
//     guard exits 1 with a real AssertionError, the runner reads
//     "AssertionError [ERR_ASSERTION]:" from the JSON report, the
//     old classifier said CORRUPT PROOF, the proof was misclassified
//     and the whole wiring was effectively a no-op. Pin the new shape.)

test('classifyProof: Node 24 AssertionError [ERR_ASSERTION] format is an assertion failure, NOT a thrown Error', () => {
	// The fixture was synthesised to mirror the real vitest JSON report
	// Node 24 produces for a kept-red test that throws an assertion
	// failure. The classifier MUST classify this as OK (assertion
	// failure), not as CORRUPT PROOF (thrown Error).
	const result = classifyFixture('ok-node24.json', 1);
	expect(result.verdict).toBe('OK');
	expect(result.failedTests).toBe(1);
	expect(result.totalTests).toBe(1);
});

test('consumeVerdict: Node 24 AssertionError [ERR_ASSERTION] format still increments failures, not corrupted', () => {
	// The classifier returned OK above; the consumer must therefore
	// increment `failures` (kept-red state), not `corrupted` (broken
	// measurement). This is the load-bearing pairing: a kept-red proof
	// on Node 24 must never silently turn into a corrupt proof
	// verdict at the gate.
	const result = classifyFixture('ok-node24.json', 1);
	expect(result.verdict).toBe('OK');

	const next = consumeVerdict(
		{ failures: 0, unexpectedPasses: 0, corrupted: 0, stale: 0 },
		result.verdict,
	);
	expect(next).toEqual({
		failures: 1,
		unexpectedPasses: 0,
		corrupted: 0,
		stale: 0,
	});
});

test('consumeVerdict: NO_TESTS verdict (real empty-suite report) increments corrupted', () => {
	const result = classifyFixture('notests.json', 1);
	expect(result.verdict).toBe('NO_TESTS');

	const next = consumeVerdict(
		{ failures: 0, unexpectedPasses: 0, corrupted: 0, stale: 0 },
		result.verdict,
	);
	expect(next).toEqual({
		failures: 0,
		unexpectedPasses: 0,
		corrupted: 1,
		stale: 0,
	});
});

test('consumeVerdict: ERROR verdict (simulated crash, non-zero/non-one exit) increments unexpectedPasses', () => {
	// ERROR is the critical case the brief calls out: a vitest process crash
	// produces an exit code that is neither 0 nor 1 (e.g., null → 'unknown' → NaN → forced to number).
	// classifyProof returns ERROR for any exitCode that is not 0 or 1 when the report
	// does not match the other patterns. We simulate this directly.
	const report = readProofReport(join(fixturesDir, 'ok.json'));
	// Force an exit code that is neither 0 nor 1 — simulates a crash.
	const result = classifyProof(report, 137);
	expect(result.verdict).toBe('ERROR');

	const next = consumeVerdict(
		{ failures: 0, unexpectedPasses: 0, corrupted: 0, stale: 0 },
		result.verdict,
	);
	expect(next).toEqual({
		failures: 0,
		unexpectedPasses: 1,
		corrupted: 0,
		stale: 0,
	});
});

test('consumeVerdict: DECLARED RED PASSED verdict increments stale (not corrupted)', () => {
	// A DECLARED RED PASSED verdict means a declared kept-red test went green —
	// the proof's claim is stale. This must increment the `stale` counter,
	// NOT the `corrupted` counter. Folding it back into `corrupted` is the
	// exact regression #1806 ronde 9 demands we catch.
	const next = consumeVerdict(
		{ failures: 0, unexpectedPasses: 0, corrupted: 0, stale: 0 },
		'DECLARED RED PASSED',
	);
	expect(next).toEqual({
		failures: 0,
		unexpectedPasses: 0,
		corrupted: 0,
		stale: 1,
	});
});

// --- Accumulation tests (multiple verdicts in sequence) ---

test('consumeVerdict: accumulates multiple verdicts without mutating input', () => {
	const initial = { failures: 0, unexpectedPasses: 0, corrupted: 0, stale: 0 };

	const r1 = consumeVerdict(initial, 'OK');
	const r2 = consumeVerdict(r1, 'OK');
	const r3 = consumeVerdict(r2, 'UNEXPECTED_PASS');
	const r4 = consumeVerdict(r3, 'CORRUPT PROOF');
	const r5 = consumeVerdict(r4, 'ERROR');
	const r6 = consumeVerdict(r5, 'DECLARED RED PASSED');

	expect(r6).toEqual({
		failures: 2,
		unexpectedPasses: 2,
		corrupted: 1,
		stale: 1,
	});

	// Input must never be mutated — pure function contract.
	expect(initial).toEqual({
		failures: 0,
		unexpectedPasses: 0,
		corrupted: 0,
		stale: 0,
	});
});

test('consumeVerdict: a single OK verdict does NOT increment unexpectedPasses (catches OK↔ERROR swap)', () => {
	const result = consumeVerdict(
		{ failures: 0, unexpectedPasses: 0, corrupted: 0, stale: 0 },
		'OK',
	);
	expect(result.unexpectedPasses).toBe(0);
});

test('consumeVerdict: a single ERROR verdict does NOT increment failures (catches OK↔ERROR swap)', () => {
	const result = consumeVerdict(
		{ failures: 0, unexpectedPasses: 0, corrupted: 0, stale: 0 },
		'ERROR',
	);
	expect(result.failures).toBe(0);
});

test('consumeVerdict: a single CORRUPT PROOF verdict does NOT increment unexpectedPasses (catches CORRUPT PROOF↔ERROR swap)', () => {
	const result = consumeVerdict(
		{ failures: 0, unexpectedPasses: 0, corrupted: 0, stale: 0 },
		'CORRUPT PROOF',
	);
	expect(result.unexpectedPasses).toBe(0);
});

test('consumeVerdict: a single UNEXPECTED_PASS verdict does NOT increment corrupted (catches UNEXPECTED_PASS↔NO_TESTS swap)', () => {
	const result = consumeVerdict(
		{ failures: 0, unexpectedPasses: 0, corrupted: 0, stale: 0 },
		'UNEXPECTED_PASS',
	);
	expect(result.corrupted).toBe(0);
});

// --- Regression guards: stale vs corrupted separation (#1806) ---

test('consumeVerdict: a single CORRUPT PROOF verdict does NOT increment stale (catches refolding DECLARED RED into corrupted)', () => {
	// If DECLARED RED PASSED is folded back into corrupted, the counterForVerdict
	// switch is broken. This test pins the boundary: CORRUPT PROOF must hit
	// `corrupted`, never `stale`.
	const result = consumeVerdict(
		{ failures: 0, unexpectedPasses: 0, corrupted: 0, stale: 0 },
		'CORRUPT PROOF',
	);
	expect(result.stale).toBe(0);
});

test('consumeVerdict: a single DECLARED RED PASSED verdict does NOT increment corrupted (catches refolding corrupted into stale)', () => {
	// The mirror of the above: if corrupted's branch is folded back into stale,
	// CORRUPT PROOF would increment stale instead of corrupted. This test pins
	// the boundary: DECLARED RED PASSED must hit `stale`, never `corrupted`.
	const result = consumeVerdict(
		{ failures: 0, unexpectedPasses: 0, corrupted: 0, stale: 0 },
		'DECLARED RED PASSED',
	);
	expect(result.corrupted).toBe(0);
});

// --- Exit-gate predicate (#1806 ronde 11) ---

test('gateShouldFail: a stale proof ALONE (stale=1, unexpectedPasses=0, corrupted=0) fails the gate', () => {
	// The ronde-8 signal in isolation: a declared kept-red test went green
	// while nothing else is wrong. The runner MUST exit non-zero. This is the
	// exact condition the brief pins — before ronde 11, no test exercised the
	// exit gate with `stale > 0` as the ONLY red counter, so deleting the
	// `stale > 0` term from the gate left everything green.
	expect(
		gateShouldFail({
			failures: 0,
			unexpectedPasses: 0,
			corrupted: 0,
			stale: 1,
		}),
	).toBe(true);
});

test('gateShouldFail: unexpectedPasses alone trips the gate', () => {
	expect(
		gateShouldFail({
			failures: 0,
			unexpectedPasses: 1,
			corrupted: 0,
			stale: 0,
		}),
	).toBe(true);
});

test('gateShouldFail: corrupted alone trips the gate', () => {
	expect(
		gateShouldFail({
			failures: 0,
			unexpectedPasses: 0,
			corrupted: 1,
			stale: 0,
		}),
	).toBe(true);
});

test('gateShouldFail: kept-red failure counts alone do NOT trip the gate', () => {
	// A proof that failed as expected is the HEALTHY state — the summary may
	// show any number of `failures` and the runner must still exit 0.
	expect(
		gateShouldFail({
			failures: 3,
			unexpectedPasses: 0,
			corrupted: 0,
			stale: 0,
		}),
	).toBe(false);
});

test('gateShouldFail: all-zero counts pass the gate', () => {
	expect(
		gateShouldFail({
			failures: 0,
			unexpectedPasses: 0,
			corrupted: 0,
			stale: 0,
		}),
	).toBe(false);
});

test('gateShouldFail: a stale proof alongside expected failures still fails the gate', () => {
	// failures and stale can coexist: the file has one kept-red test failing
	// as expected AND one declared red that went green. The green one must
	// fail CI even though the other axis is healthy.
	expect(
		gateShouldFail({
			failures: 1,
			unexpectedPasses: 0,
			corrupted: 0,
			stale: 1,
		}),
	).toBe(true);
});
