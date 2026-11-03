import { describe, expect, test } from 'vitest';

import { formatStaffStatusLabel } from './status-labels';

// A translation function that returns a value distinguishable from the raw
// API enum so a passthrough regression (r3-F5: printing "Active"/"Admin"
// straight from the wire) fails loudly instead of coincidentally matching
// the English fallback text.
const t = (key: string): string => `t:${key}`;

describe('formatStaffStatusLabel', () => {
	test('routes the API enum through the i18n key, not the raw string', () => {
		expect(formatStaffStatusLabel('Active', t)).toBe('t:common:status-active');
		expect(formatStaffStatusLabel('Suspended', t)).toBe(
			't:common:status-suspended',
		);
	});

	test('falls back to the unknown key for null/unrecognised values', () => {
		expect(formatStaffStatusLabel(null, t)).toBe('t:common:status-unknown');
		expect(formatStaffStatusLabel('Unknown', t)).toBe(
			't:common:status-unknown',
		);
	});
});
