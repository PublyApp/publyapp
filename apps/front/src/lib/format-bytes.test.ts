import { describe, expect, test } from 'vitest';

import { formatBytes } from './format-bytes';

describe('formatBytes (#2408)', () => {
	test('English uses KB/MB with a decimal point', () => {
		expect(formatBytes(16_800_000, 'en')).toBe('16.8 MB');
		expect(formatBytes(977_000, 'en')).toBe('977 KB');
	});

	test('French uses Ko/Mo with a decimal comma', () => {
		expect(formatBytes(16_800_000, 'fr')).toBe('16,8 Mo');
		expect(formatBytes(977_000, 'fr')).toBe('977 Ko');
		expect(formatBytes(2_000_000, 'fr-FR')).toBe('2 Mo');
	});

	test('boundaries between B, Ko, Mo and Go', () => {
		expect(formatBytes(0, 'en')).toBe('0 B');
		expect(formatBytes(999, 'en')).toBe('999 B');
		expect(formatBytes(1000, 'en')).toBe('1 KB');
		expect(formatBytes(999_999, 'en')).toBe('1 MB');
		expect(formatBytes(1_000_000, 'en')).toBe('1 MB');
		expect(formatBytes(1_000_000_000, 'en')).toBe('1 GB');
		expect(formatBytes(999_960, 'en')).toBe('1 MB');
		expect(formatBytes(999_960_000, 'en')).toBe('1 GB');
		expect(formatBytes(999, 'fr')).toBe('999 o');
		expect(formatBytes(1000, 'fr')).toBe('1 Ko');
		expect(formatBytes(1_000_000, 'fr')).toBe('1 Mo');
		expect(formatBytes(1_500_000_000, 'fr')).toBe('1,5 Go');
	});

	test('a displayed limit never reads above the real cap', () => {
		expect(formatBytes(16_777_216, 'en', 'limit')).toBe('16.7 MB');
		expect(formatBytes(8_388_608, 'en', 'limit')).toBe('8.3 MB');
		expect(formatBytes(8_388_608, 'fr', 'limit')).toBe('8,3 Mo');
		expect(formatBytes(16_777_216, 'fr', 'limit')).toBe('16,7 Mo');
		expect(formatBytes(2_000_000, 'fr', 'limit')).toBe('2 Mo');
	});

	test('non-finite input does not render NaN', () => {
		expect(formatBytes(Number.NaN, 'en')).toBe('—');
		expect(formatBytes(Number.POSITIVE_INFINITY, 'fr')).toBe('—');
	});
});
