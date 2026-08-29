/** @vitest-environment jsdom */
import { cleanup } from '@testing-library/react';
import { afterEach, describe, expect, test } from 'vitest';

import { formatFailureCause } from './_jobs-helpers';

const t = (key: string): string =>
	key === 'common:no-cause' ? 'No cause recorded' : key;

afterEach(() => {
	cleanup();
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
	});

	test('returns the no-cause marker for undefined', () => {
		expect(formatFailureCause(undefined, t)).toBe('No cause recorded');
	});

	test('returns the no-cause marker for empty string', () => {
		// This is the case the old `??` form missed: empty string passed through
		// and rendered a blank cell.
		expect(formatFailureCause('', t)).toBe('No cause recorded');
	});

	test('returns the no-cause marker for whitespace-only string', () => {
		// A cause of only spaces is absent, not present.
		expect(formatFailureCause('   ', t)).toBe('No cause recorded');
	});

	test('never returns the dash (no-value) — that key is for non-cause fields', () => {
		for (const value of [null, undefined, '', '   ']) {
			expect(formatFailureCause(value, t)).not.toBe('—');
		}
	});
});
