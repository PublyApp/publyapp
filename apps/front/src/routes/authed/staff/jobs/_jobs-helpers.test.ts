/** @vitest-environment jsdom */
import { cleanup } from '@testing-library/react';
import { afterEach, describe, expect, test } from 'vitest';

import { formatFailureCause } from './_jobs-helpers';

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
	// as a blank cell. The predicate now uses \p{Default_Ignorable_Code_Point}
	// (covers U+115F, U+1160, U+3164 alongside Cf) plus a named exception for
	// U+2800.

	test('returns the no-cause marker for U+2800 BRAILLE PATTERN BLANK', () => {
		// U+2800 is category So (printing) — Unicode does NOT flag it as
		// default-ignorable. The named exception in the predicate is what
		// catches it; if a future refactor drops U+2800 from the exception,
		// this test goes red.
		expect(formatFailureCause('\u2800', t)).toBe('No cause recorded');
		expect(tCalls).toContain('common:no-cause');
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

	test('never returns the dash (no-value) — that key is for non-cause fields', () => {
		for (const value of [null, undefined, '', '   ']) {
			tCalls.length = 0;
			expect(formatFailureCause(value, t)).not.toBe('—');
		}
	});
});
