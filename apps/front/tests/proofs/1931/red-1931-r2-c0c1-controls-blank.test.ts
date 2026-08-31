/**
 * @vitest-environment jsdom *
 * KEPT RED TEST — issue #1931 (r2, C0/C1 control character gap).
 *
 * ## Context
 *
 * The r1 proof (`./dump/proof-1931.md`) covered Cf, Hangul fillers, U+2800
 * and Zs — but NOT C0/C1 control characters (U+0000–U+0008, U+000B/C,
 * U+000E–U+001F, U+007F–U+009F). The adversarial reviewer verified at
 * runtime that U+0001, U+0007, U+007F, U+0085 and U+009F all survived the
 * r1 predicate (`\p{Default_Ignorable_Code_Point}` + U+2800) and were
 * returned raw. Browsers paint no glyph for C0/C1 controls, so the
 * operator saw exactly the empty cell #1931 is about.
 *
 * The r2 fix adds `\p{Cc}` to the predicate. This proof keeps the BUG
 * alive: it asserts that each of the five control characters the
 * reviewer named renders as BLANK (the buggy behavior). On corrected
 * code, each renders as the marker instead — so each assertion FAILS,
 * which is the kept-red state.
 *
 * ## Three-state discrimination
 *
 * - BUG PRESENT (`\p{Cc}` dropped from predicate): the control character
 *   survives the predicate raw and the function returns it. `rendered`
 *   equals the raw control character → assertion PASSES. The CI step
 *   *Verify paired red proofs* turns RED.
 *
 * - BUG ABSENT (corrected code, `\p{Cc}` present): the control character
 *   is stripped, `''.length === 0` is true, the function returns the
 *   marker. `rendered` equals the marker, not the raw control →
 *   assertion FAILS with AssertionError → kept-red, the expected state.
 *
 * - MESURE IMPOSSIBLE: the predicate reference or the test harness
 *   cannot be imported. The test throws before asserting → CORRUPT PROOF
 *   → CI red.
 *
 * ## Replay
 *   cd apps/front && pnpm exec vitest run --config vitest.preuves.config.ts \
 *     tests/proofs/1931/red-1931-r2-c0c1-controls-blank.test.ts
 *
 * Expected: FAIL — on corrected code, every C0/C1 control renders as
 * the marker, not blank.
 *
 * ## Mutations to introduce the red (restore the bug)
 *
 * **Mutation A — drop `\p{Cc}`**: in `_jobs-helpers.ts`, change
 * `/[\p{Default_Ignorable_Code_Point}\p{Cc}\u2800]/gu` to
 * `/[\p{Default_Ignorable_Code_Point}\u2800]/gu`. The five control
 * characters survive the predicate raw → each assertion PASSES → stale
 * proof signal (CI red).
 */
import { describe, expect, test } from 'vitest';

import { formatFailureCause } from '../../../src/routes/authed/staff/jobs/_jobs-helpers';

// The marker the corrected function returns for a visually-blank cause.
// We don't need the real translation — the corrected function returns
// `t('common:no-cause')` which is a non-empty, non-control string.
const rendered = (cause: string): string =>
	formatFailureCause(cause, (key) =>
		key === 'common:no-cause' ? 'NO_CAUSE' : key,
	);

describe('r2 C0/C1 control characters — RED: each renders blank (#1931)', () => {
	test('U+0001 (SOH) renders blank — the bug the r1 predicate missed', () => {
		// On buggy code: returns '\u0001' (raw control, renders blank).
		// On corrected code: returns 'NO_CAUSE' → assertion FAILS (kept-red).
		expect(rendered('')).toBe('');
	});

	test('U+0007 (BEL) renders blank — the bug the r1 predicate missed', () => {
		expect(rendered('')).toBe('');
	});

	test('U+007F (DEL) renders blank — the bug the r1 predicate missed', () => {
		expect(rendered('')).toBe('');
	});

	test('U+0085 (NEL, C1) renders blank — the bug the r1 predicate missed', () => {
		expect(rendered('')).toBe('');
	});

	test('U+009F (APC, C1) renders blank — the bug the r1 predicate missed', () => {
		expect(rendered('')).toBe('');
	});
});
