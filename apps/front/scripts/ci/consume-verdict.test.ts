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
 * | CORRUPT PROOF ↔ NO_TESTS | `CORRUPT PROOF verdict increments corrupted` OR `NO_TESTS verdict increments corrupted` (same counter — NOT a distinguishing pair) |
 * | CORRUPT PROOF ↔ UNEXPECTED_PASS | `CORRUPT PROOF verdict increments corrupted` OR `UNEXPECTED_PASS verdict increments unexpectedPasses` |
 * | CORRUPT PROOF ↔ ERROR | `CORRUPT PROOF verdict increments corrupted` OR `ERROR verdict increments unexpectedPasses` |
 * | NO_TESTS ↔ UNEXPECTED_PASS | `NO_TESTS verdict increments corrupted` OR `UNEXPECTED_PASS verdict increments unexpectedPasses` |
 * | NO_TESTS ↔ ERROR | `NO_TESTS verdict increments corrupted` OR `ERROR verdict increments unexpectedPasses` |
 * | UNEXPECTED_PASS ↔ ERROR | `UNEXPECTED_PASS verdict increments unexpectedPasses` OR `ERROR verdict increments unexpectedPasses` (same counter — NOT a distinguishing pair) |
 *
 * Note: CORRUPT PROOF/NO_TESTS both map to `corrupted`, and UNEXPECTED_PASS/ERROR
 * both map to `unexpectedPasses`. Swapping within these pairs does NOT change
 * behavior — they are intentionally coalesced. The distinguishing mutations are
 * the cross-group swaps, each of which has a named test that detects it.
 */
import { test, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

import { classifyProof, readProofReport } from './classify-proof.mts';
import { consumeVerdict, counterForVerdict } from './consume-verdict.mts';

const fixturesDir = fileURLToPath(new URL('./__fixtures__/reports/', import.meta.url));

/**
 * Load a real vitest JSON report and classify it with the given exit code.
 * This is the load-bearing pattern: a test that hand-crafted a ClassificationResult
 * would verify the switch against a model, not against reality. We feed the chain
 * a real vitest JSON report, exactly as run-preuves.mts does.
 */
function classifyFixture(file: string, exitCode: number) {
	const report = readProofReport(join(fixturesDir, file));
	return classifyProof(report, exitCode);
}

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

// --- consumeVerdict tests with REAL vitest JSON reports ---

test('consumeVerdict: OK verdict (real assertion-failure report) increments failures', () => {
	const result = classifyFixture('ok.json', 1);
	expect(result.verdict).toBe('OK');

	const next = consumeVerdict({ failures: 0, unexpectedPasses: 0, corrupted: 0 }, result.verdict);
	expect(next).toEqual({ failures: 1, unexpectedPasses: 0, corrupted: 0 });
});

test('consumeVerdict: CORRUPT PROOF verdict (real thrown-Error report) increments corrupted', () => {
	const result = classifyFixture('corrupt.json', 1);
	expect(result.verdict).toBe('CORRUPT PROOF');

	const next = consumeVerdict({ failures: 0, unexpectedPasses: 0, corrupted: 0 }, result.verdict);
	expect(next).toEqual({ failures: 0, unexpectedPasses: 0, corrupted: 1 });
});

test('consumeVerdict: UNEXPECTED_PASS verdict (real passing test report) increments unexpectedPasses', () => {
	const result = classifyFixture('pass.json', 0);
	expect(result.verdict).toBe('UNEXPECTED_PASS');

	const next = consumeVerdict({ failures: 0, unexpectedPasses: 0, corrupted: 0 }, result.verdict);
	expect(next).toEqual({ failures: 0, unexpectedPasses: 1, corrupted: 0 });
});

test('consumeVerdict: NO_TESTS verdict (real empty-suite report) increments corrupted', () => {
	const result = classifyFixture('notests.json', 1);
	expect(result.verdict).toBe('NO_TESTS');

	const next = consumeVerdict({ failures: 0, unexpectedPasses: 0, corrupted: 0 }, result.verdict);
	expect(next).toEqual({ failures: 0, unexpectedPasses: 0, corrupted: 1 });
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

	const next = consumeVerdict({ failures: 0, unexpectedPasses: 0, corrupted: 0 }, result.verdict);
	expect(next).toEqual({ failures: 0, unexpectedPasses: 1, corrupted: 0 });
});

// --- Accumulation tests (multiple verdicts in sequence) ---

test('consumeVerdict: accumulates multiple verdicts without mutating input', () => {
	const initial = { failures: 0, unexpectedPasses: 0, corrupted: 0 };

	const r1 = consumeVerdict(initial, 'OK');
	const r2 = consumeVerdict(r1, 'OK');
	const r3 = consumeVerdict(r2, 'UNEXPECTED_PASS');
	const r4 = consumeVerdict(r3, 'CORRUPT PROOF');
	const r5 = consumeVerdict(r4, 'ERROR');

	expect(r5).toEqual({ failures: 2, unexpectedPasses: 2, corrupted: 1 });

	// Input must never be mutated — pure function contract.
	expect(initial).toEqual({ failures: 0, unexpectedPasses: 0, corrupted: 0 });
});

test('consumeVerdict: a single OK verdict does NOT increment unexpectedPasses (catches OK↔ERROR swap)', () => {
	const result = consumeVerdict({ failures: 0, unexpectedPasses: 0, corrupted: 0 }, 'OK');
	expect(result.unexpectedPasses).toBe(0);
});

test('consumeVerdict: a single ERROR verdict does NOT increment failures (catches OK↔ERROR swap)', () => {
	const result = consumeVerdict({ failures: 0, unexpectedPasses: 0, corrupted: 0 }, 'ERROR');
	expect(result.failures).toBe(0);
});

test('consumeVerdict: a single CORRUPT PROOF verdict does NOT increment unexpectedPasses (catches CORRUPT PROOF↔ERROR swap)', () => {
	const result = consumeVerdict({ failures: 0, unexpectedPasses: 0, corrupted: 0 }, 'CORRUPT PROOF');
	expect(result.unexpectedPasses).toBe(0);
});

test('consumeVerdict: a single UNEXPECTED_PASS verdict does NOT increment corrupted (catches UNEXPECTED_PASS↔NO_TESTS swap)', () => {
	const result = consumeVerdict({ failures: 0, unexpectedPasses: 0, corrupted: 0 }, 'UNEXPECTED_PASS');
	expect(result.corrupted).toBe(0);
});
