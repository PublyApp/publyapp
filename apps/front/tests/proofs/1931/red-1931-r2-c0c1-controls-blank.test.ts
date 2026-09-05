/**
 * @vitest-environment node
 * KEPT RED TEST — issue #1931 (visually-blank failure cause).
 *
 * ## What this proof keeps alive
 *
 * Issue #1931 is about a cause made only of characters that RENDER BLANK but
 * are not in Unicode category `Cf`: U+2800 BRAILLE PATTERN BLANK (So) and
 * the three Hangul fillers U+3164 (Lo), U+115F (Lo), U+1160 (Lo). The r1 fix
 * added `\p{Default_Ignorable_Code_Point}` plus a Braille script/dot-mask
 * classifier.
 * The r2 review found a second gap of the same shape one category over:
 * C0/C1 control characters (U+0000–U+0008, U+000B/C, U+000E–U+001F,
 * U+007F–U+009F) survived the r1 predicate and rendered as an empty cell;
 * the r2 fix added `\p{Cc}`.
 *
 * This file keeps BOTH defects alive. Each test asserts the BUGGY behavior —
 * the character renders blank, so `formatFailureCause` returns the raw
 * character. On corrected code the function returns the marker instead, so
 * every assertion FAILS with an AssertionError — the kept-red state the CI
 * step *Verify paired red proofs* expects.
 *
 * ## Three-state discrimination
 *
 * - BUG PRESENT (adverse mutation applied): the blank character survives the
 *   predicate raw and the function returns it. `rendered` equals the raw
 *   character → assertion PASSES → the CI step sees a declared kept-red
 *   test green → STALE PROOF → CI RED.
 * - BUG ABSENT (corrected code): the character is stripped, the function
 *   returns the marker. `rendered` equals the marker, not the raw character →
 *   assertion FAILS with AssertionError → kept-red, the expected state.
 * - MESURE IMPOSSIBLE: the predicate reference or the test harness cannot be
 *   imported. The test throws before asserting → CORRUPT PROOF → CI red.
 *
 * ## Replay
 *   cd apps/front && pnpm exec vitest run --config vitest.preuves.config.ts \
 *     tests/proofs/1931/red-1931-r2-c0c1-controls-blank.test.ts
 *
 * Expected: FAIL — on corrected code, every blank-rendering character
 * produces the marker, not the raw character.
 *
 * ## Adverse mutations that restore the bug (each turns a kept-red test green)
 *
 * The three mechanisms are independent — each reactivates a distinct subset
 * of this proof, so no single one of them is invisible to the suite.
 *
 * **Mechanism I — drop the Braille structural branch (the r1 primary defect):**
 * in `_jobs-helpers.ts`, remove the `BRAILLE_PATTERN` plus zero-dot-mask
 * branch from `isVisuallyBlank`. U+2800 survives raw → `U+2800 (BRAILLE
 * PATTERN BLANK) renders blank` PASSES → stale proof. The Hangul fillers stay
 * stripped by the property, so only that one test lights up — the exact
 * defect #1931 names, and exactly what this round extends the proof for.
 *
 * **Mechanism II — narrow the property back to `\p{Cf}` (the pre-#1931
 * code):** replace `\p{Default_Ignorable_Code_Point}` with `\p{Cf}`. The
 * Hangul fillers are Lo, not Cf, so they survive raw → the three filler
 * tests PASS → stale proof. (U+2800 stays stripped by the Braille branch and
 * the C0/C1 controls by `\p{Cc}` — this mechanism lights up ONLY fillers.)
 *
 * **Mechanism III — drop the `\p{Cc}` category (the r2 defect):** remove
 * `\p{Cc}` from the class. The five C0/C1 control characters survive raw →
 * the five control tests PASS → stale proof.
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
		expect(rendered('\u0001')).toBe('\u0001');
	});

	test('U+0007 (BEL) renders blank — the bug the r1 predicate missed', () => {
		expect(rendered('\u0007')).toBe('\u0007');
	});

	test('U+007F (DEL) renders blank — the bug the r1 predicate missed', () => {
		expect(rendered('\u007F')).toBe('\u007F');
	});

	test('U+0085 (NEL, C1) renders blank — the bug the r1 predicate missed', () => {
		expect(rendered('\u0085')).toBe('\u0085');
	});

	test('U+009F (APC, C1) renders blank — the bug the r1 predicate missed', () => {
		expect(rendered('\u009F')).toBe('\u009F');
	});
});

describe('r1 visually-blank printing characters — RED: each renders blank (#1931)', () => {
	test('U+2800 (BRAILLE PATTERN BLANK) renders blank', () => {
		// U+2800 is category So — NOT default-ignorable and NOT Cc. Only the
		// Braille script plus zero-dot-mask branch strips it; Mechanism I
		// restores the bug.
		expect(rendered('\u2800')).toBe('\u2800');
	});

	test('U+3164 (HANGUL FILLER) renders blank', () => {
		// Lo, covered by \p{Default_Ignorable_Code_Point}. Mechanism II
		// (narrowing the property back to \p{Cf}) restores the bug.
		expect(rendered('\u3164')).toBe('\u3164');
	});

	test('U+115F (HANGUL CHOSEONG FILLER) renders blank', () => {
		expect(rendered('\u115F')).toBe('\u115F');
	});

	test('U+1160 (HANGUL JUNGSEONG FILLER) renders blank', () => {
		expect(rendered('\u1160')).toBe('\u1160');
	});
});
