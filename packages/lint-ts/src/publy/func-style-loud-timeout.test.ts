/**
 * @vitest-environment node
 *
 * #1968 — paired red/green proof for the loud-timeout wrapper.
 *
 * The defect: the previous shape was a bare `it('leg 1: ...')`
 * with no timeout override. Vitest's default 5000ms kicked in
 * and surfaced a slow `git check-ignore` call as a stopwatch
 * failure ("Test timed out in 5000ms") that an operator reads as
 * a correctness regression. A genuine regression in ignore
 * handling would have produced the same shape and been dismissed
 * as "that flaky timeout again".
 *
 * The fix:
 * 1. The two legs run under a 30s budget justified by measurement
 *    (3.44s..4.30s observed across 5 quiet runs; 6× headroom for
 *    23-lane load).
 * 2. The legs run through `withLoudTimeout(label, budget, fn)`,
 *    which measures the wall time and throws a NAMED error
 *    when the budget is exceeded. The error names the test
 *    label, the actual elapsed time, the configured budget,
 *    and the most likely cause (load + spawn latency).
 *
 * ## Why a unit test for the wrapper
 *
 * The wrapper is the load-bearing part of the fix: a test
 * runner that lets the stopwatch speak for itself is exactly
 * the defect. A unit test that exercises the wrapper with a
 * mock that exceeds the budget pins the loud-message shape by
 * construction. If a future refactor weakens the wrapper (e.g.
 * catches the timeout silently, or replaces the message with
 * a generic "test took too long"), this test goes RED with a
 * precise cause.
 *
 * ## Why not a real-process test
 *
 * A real-process test would have to artificially slow git to
 * trigger the wrapper. The wrapper is pure (no IO beyond
 * `performance.now()`), so the unit test is the cheaper,
 * more deterministic proof. The real-process budget is
 * verified by the comment block on the legs themselves.
 */
import { describe, expect, test } from 'vitest';

import {
	type LoudTimeoutResult,
	withLoudTimeout,
} from './func-style-config.test.ts';

describe('#1968 — withLoudTimeout throws loud when the budget is exceeded', () => {
	test('reports the actual elapsed time, the configured budget, and the most likely cause', async () => {
		// Mock a slow operation. 200ms is well above the 50ms budget
		// but well below the real budget used in the legs (30000ms),
		// so the test does not have to wait a real second to run.
		const SLOW_OPERATION_MS = 200;
		const TIGHT_BUDGET_MS = 50;

		let caught: Error | null = null;
		try {
			await withLoudTimeout(
				'mocked leg',
				TIGHT_BUDGET_MS,
				() =>
					new Promise<void>((resolve) => {
						setTimeout(resolve, SLOW_OPERATION_MS);
					}),
			);
		} catch (err) {
			caught = err as Error;
		}

		// The wrapper MUST throw — a silent over-budget is exactly
		// the defect we are fixing.
		expect(caught).not.toBeNull();
		const message = caught!.message;

		// The error must NAME the test (so the operator can grep).
		expect(message).toContain('mocked leg');
		// The error must NAME the actual elapsed time (so the
		// operator sees the magnitude of the over-budget, not just
		// "took too long").
		expect(message).toMatch(/took \d+ms/);
		// The error must NAME the configured budget (so the
		// operator sees the threshold, not a hidden constant).
		expect(message).toContain(`${String(TIGHT_BUDGET_MS)}ms budget`);
		// The error must NAME the most likely cause — otherwise
		// the message is just a generic "test took too long" and
		// the operator cannot tell load from regression.
		expect(message).toContain('git check-ignore');
		expect(message).toContain('load');
	});

	test('returns the wrapped value when the budget is respected', async () => {
		// Symmetric leg: the happy path must continue to work
		// after the wrapper is added. A wrapper that breaks
		// healthy runs is worse than no wrapper.
		const result: LoudTimeoutResult<number> = await withLoudTimeout(
			'fast leg',
			5_000,
			() => Promise.resolve(42),
		);
		expect(result.entries).toBe(42);
		expect(result.elapsedMs).toBeGreaterThanOrEqual(0);
		expect(result.elapsedMs).toBeLessThan(5_000);
	});
});
