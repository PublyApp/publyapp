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

	test('never returns the dash (no-value) — that key is for non-cause fields', () => {
		for (const value of [null, undefined, '', '   ']) {
			tCalls.length = 0;
			expect(formatFailureCause(value, t)).not.toBe('—');
		}
	});
});
