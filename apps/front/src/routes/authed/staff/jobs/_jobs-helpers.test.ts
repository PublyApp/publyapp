/** @vitest-environment jsdom */
import { cleanup } from '@testing-library/react';
import { afterEach, describe, expect, test } from 'vitest';

import { formatFailureCause, isVisuallyBlank } from './_jobs-helpers';

// Track calls so mutations that hardcode a string (bypassing t()) are caught.
const tCalls: string[] = [];
const t = (key: string): string => {
	tCalls.push(key);
	if (key === 'common:no-cause') {
		return 'No cause recorded';
	}

	return key;
};

afterEach(() => {
	cleanup();
	tCalls.length = 0;
});

describe('formatFailureCause — shared decision for failure cause display', () => {
	test('returns the trimmed cause when present', () => {
		expect(formatFailureCause('Connection refused', t)).toBe(
			'Connection refused',
		);
	});

	test('trims surrounding whitespace from a present cause', () => {
		expect(formatFailureCause('  boom  ', t)).toBe('boom');
	});

	test('returns the no-cause marker for null', () => {
		expect(formatFailureCause(null, t)).toBe('No cause recorded');
		expect(tCalls).toContain('common:no-cause');
	});

	test('returns the no-cause marker for undefined', () => {
		expect(formatFailureCause(undefined, t)).toBe('No cause recorded');
		expect(tCalls).toContain('common:no-cause');
	});

	test('returns the no-cause marker for empty string', () => {
		// This is the case the old `??` form missed: empty string passed through
		// and rendered a blank cell.
		expect(formatFailureCause('', t)).toBe('No cause recorded');
		expect(tCalls).toContain('common:no-cause');
	});

	test('returns the no-cause marker for whitespace-only string', () => {
		// A cause of only spaces is absent, not present.
		expect(formatFailureCause('   ', t)).toBe('No cause recorded');
		expect(tCalls).toContain('common:no-cause');
	});

	test('returns the no-cause marker for zero-width space (U+200B)', () => {
		// U+200B is category Cf (format), NOT WhiteSpace — `trim()` leaves it
		// intact. A cause consisting solely of U+200B is visually empty and
		// must render the marker, not a blank cell. See brief #1879.
		expect(formatFailureCause('\u200B', t)).toBe('No cause recorded');
		expect(tCalls).toContain('common:no-cause');
	});

	test('returns the no-cause marker for ASCII whitespace mixed with U+200B', () => {
		// Spaces around a zero-width space: still visually empty.
		expect(formatFailureCause('  \u200B  ', t)).toBe('No cause recorded');
		expect(tCalls).toContain('common:no-cause');
	});

	test('returns the no-cause marker when the whitespace sits BETWEEN two invisibles', () => {
		// The arrangement above (spaces OUTSIDE) is handled by the leading
		// `cause.trim()` alone, so it passes with or without the strip. This
		// one does not: `trim()` cannot touch a space enclosed by two
		// zero-width characters, and stripping the invisibles leaves a lone
		// space of length 1. It is the arrangement that reaches the operator
		// as an empty cell if the trailing `.trim()` is dropped.
		expect(formatFailureCause('\u200B \u200B', t)).toBe('No cause recorded');
		expect(formatFailureCause('\u2800 \u2800', t)).toBe('No cause recorded');
		expect(formatFailureCause('\u2800\u200B ', t)).toBe('No cause recorded');
		expect(tCalls).toContain('common:no-cause');
	});

	// Issue #1931 — visually-blank characters outside Unicode category Cf
	// (U+2800 BRAILLE PATTERN BLANK, the three Hangul fillers) used to render
	// as a blank cell. The classifier now uses \p{White_Space},
	// \p{Default_Ignorable_Code_Point}, \p{Cc}, and the Braille script's
	// structural dot mask.

	test('returns the no-cause marker for U+2800 BRAILLE PATTERN BLANK', () => {
		// U+2800 is category So (printing) and is not default-ignorable. The
		// classifier identifies its Braille script and zero dot mask instead of
		// maintaining a code-point exception.
		expect(formatFailureCause('\u2800', t)).toBe('No cause recorded');
		expect(tCalls).toContain('common:no-cause');
	});

	test('classifies Braille patterns by script and dot mask', () => {
		// Every Braille pattern is in the same Unicode Script block. Its low
		// eight bits encode the raised-dot mask, so only the zero-dot pattern
		// is blank. This checks the property-based classifier across the whole
		// domain and ensures dotted Braille remains visible.
		for (let codePoint = 0x2800; codePoint <= 0x28ff; codePoint += 1) {
			const hasRaisedDots = (codePoint & 0xff) !== 0;
			expect(isVisuallyBlank(String.fromCodePoint(codePoint))).toBe(
				!hasRaisedDots,
			);
		}
	});

	test('returns the no-cause marker for U+3164 HANGUL FILLER', () => {
		// U+3164 is Hangul Filler (category Lo). It IS default-ignorable, so
		// the Unicode property covers it without an explicit exception.
		expect(formatFailureCause('\u3164', t)).toBe('No cause recorded');
		expect(tCalls).toContain('common:no-cause');
	});

	test('returns the no-cause marker for U+115F HANGUL CHOSEONG FILLER', () => {
		expect(formatFailureCause('\u115F', t)).toBe('No cause recorded');
		expect(tCalls).toContain('common:no-cause');
	});

	test('returns the no-cause marker for U+1160 HANGUL JUNGSEONG FILLER', () => {
		expect(formatFailureCause('\u1160', t)).toBe('No cause recorded');
		expect(tCalls).toContain('common:no-cause');
	});

	test('returns the no-cause marker for U+00A0 NO-BREAK SPACE', () => {
		// U+00A0 is category Zs — `trim()` already strips it; pinning here so
		// a future refactor that removes `trim()` from the pipeline is caught.
		expect(formatFailureCause('\u00A0', t)).toBe('No cause recorded');
		expect(tCalls).toContain('common:no-cause');
	});

	test('returns the no-cause marker for a mix of U+2800 and U+200B', () => {
		// The mix the operator might actually see: a copy-paste artefact from
		// upstream logging that combines a printing-but-blank symbol with a
		// real format character.
		expect(formatFailureCause('\u2800\u200B', t)).toBe('No cause recorded');
		expect(tCalls).toContain('common:no-cause');
	});

	test('returns the no-cause marker for U+2800 surrounded by spaces', () => {
		// `trim()` strips the spaces, leaving just U+2800 for the predicate.
		expect(formatFailureCause('  \u2800  ', t)).toBe('No cause recorded');
		expect(tCalls).toContain('common:no-cause');
	});

	// C0/C1 control characters (U+0000–U+0008, U+000B/C, U+000E–U+001F,
	// U+007F–U+009F) are NOT default-ignorable and NOT stripped by trim(),
	// but browsers paint no glyph for them. A cause consisting solely of
	// control characters must render the marker — otherwise the operator
	// sees an empty cell. These tests pin the `\p{Cc}` addition to the
	// predicate; if `\p{Cc}` is dropped, they go red.

	test('returns the no-cause marker for U+0001 (SOH, C0 control)', () => {
		expect(formatFailureCause('\u0001', t)).toBe('No cause recorded');
		expect(tCalls).toContain('common:no-cause');
	});

	test('returns the no-cause marker for U+0007 (BEL, C0 control)', () => {
		expect(formatFailureCause('\u0007', t)).toBe('No cause recorded');
		expect(tCalls).toContain('common:no-cause');
	});

	test('returns the no-cause marker for U+007F (DEL, C0 control)', () => {
		expect(formatFailureCause('\u007F', t)).toBe('No cause recorded');
		expect(tCalls).toContain('common:no-cause');
	});

	test('returns the no-cause marker for U+0085 (NEL, C1 control)', () => {
		expect(formatFailureCause('\u0085', t)).toBe('No cause recorded');
		expect(tCalls).toContain('common:no-cause');
	});

	test('returns the no-cause marker for U+009F (APC, C1 control)', () => {
		expect(formatFailureCause('\u009F', t)).toBe('No cause recorded');
		expect(tCalls).toContain('common:no-cause');
	});

	// Property-only code points that would never appear in anyone's
	// hand-written list. These pin the headline claim "a Unicode property,
	// NOT a hand-written list": if the predicate is replaced with a
	// hand-written list of the tested code points, these go red.

	test('returns the no-cause marker for U+061C ARABIC LETTER MARK', () => {
		// U+061C is category Cf (format) AND default-ignorable. It would
		// never appear in a hand-written list — it's an invisible
		// directional mark used in Arabic typesetting.
		expect(formatFailureCause('\u061C', t)).toBe('No cause recorded');
		expect(tCalls).toContain('common:no-cause');
	});

	test('returns the no-cause marker for U+2066 LEFT-TO-RIGHT ISOLATE', () => {
		// U+2066 is category Cf (format) AND default-ignorable — a
		// bidirectional isolation character. Another code point that no
		// hand-written list would include.
		expect(formatFailureCause('\u2066', t)).toBe('No cause recorded');
		expect(tCalls).toContain('common:no-cause');
	});

	test('returns the no-cause marker for U+E0074 (tag character, default-ignorable)', () => {
		// U+E0074 is a tag character (category Cf) AND default-ignorable.
		// Tag characters are invisible metadata — the kind of code point
		// that only a Unicode property would catch.
		expect(formatFailureCause('\u{E0074}', t)).toBe('No cause recorded');
		expect(tCalls).toContain('common:no-cause');
	});

	test('preserves Cf format characters that are NOT default-ignorable (contract boundary)', () => {
		// `\p{Default_Ignorable_Code_Point}` is the default-ignorable
		// SUBSET of Cf, not all of Cf. U+0600 ARABIC NUMBER SIGN and
		// U+070F SYRIAC ABBREVIATION MARK are category Cf but NOT
		// default-ignorable — Unicode gives them a rendering role, so the
		// contract deliberately leaves them alone. Widening the predicate
		// to strip all of Cf would swallow them and this test would go red.
		for (const cause of ['\u0600', '\u070F']) {
			tCalls.length = 0;
			expect(formatFailureCause(cause, t)).toBe(cause);
			expect(tCalls).not.toContain('common:no-cause');
		}
	});

	// The other half of the requirement — the widened predicate must NOT
	// swallow real, single-glyph content. A cause that is legitimately a
	// single visible character carries information the operator needs.

	test('preserves a single dash as a real cause', () => {
		// `-` is a deliberate, readable cause (e.g. "the worker reported a
		// dash to mean 'unspecified'"). Replacing it with "no cause" would
		// be the same product failure in the other direction.
		expect(formatFailureCause('-', t)).toBe('-');
		expect(tCalls).not.toContain('common:no-cause');
	});

	test('preserves a single question mark as a real cause', () => {
		expect(formatFailureCause('?', t)).toBe('?');
		expect(tCalls).not.toContain('common:no-cause');
	});

	test('preserves a single exclamation mark as a real cause', () => {
		expect(formatFailureCause('!', t)).toBe('!');
		expect(tCalls).not.toContain('common:no-cause');
	});

	test('preserves a single CJK ideograph as a real cause', () => {
		// 中 — common in non-Latin failure messages.
		expect(formatFailureCause('\u4e2d', t)).toBe('\u4e2d');
		expect(tCalls).not.toContain('common:no-cause');
	});

	test('preserves a single emoji as a real cause', () => {
		// ✨ — emoji are printing characters in So, but unlike U+2800 they
		// are NOT in the named exception. They render as themselves.
		expect(formatFailureCause('\u2728', t)).toBe('\u2728');
		expect(tCalls).not.toContain('common:no-cause');
	});

	test('preserves a single accented letter as a real cause', () => {
		// é — category Ll, definitely not blank.
		expect(formatFailureCause('é', t)).toBe('é');
		expect(tCalls).not.toContain('common:no-cause');
	});

	test('preserves a visible glyph next to U+2800', () => {
		// A real character surrounded by an "invisible" one: the real
		// character must survive, not the marker.
		expect(formatFailureCause('a\u2800', t)).toBe('a\u2800');
		expect(tCalls).not.toContain('common:no-cause');
	});

	test('preserves a dotted Braille pattern as a real cause', () => {
		// The classifier must not treat the whole Braille script as blank. A
		// raised dot is visible content, unlike the zero-dot pattern.
		expect(formatFailureCause('\u2801', t)).toBe('\u2801');
		expect(tCalls).not.toContain('common:no-cause');
	});

	test('never returns the dash (no-value) — that key is for non-cause fields', () => {
		for (const value of [null, undefined, '', '   ']) {
			tCalls.length = 0;
			expect(formatFailureCause(value, t)).not.toBe('—');
		}
	});
});
