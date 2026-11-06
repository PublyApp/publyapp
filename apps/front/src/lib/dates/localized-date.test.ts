import { describe, expect, test } from 'vitest';

import {
	formatLocalizedDate,
	localizedDatePlaceholder,
	parseLocalizedDate,
} from './localized-date';

describe('localized date filter helpers (#2291 M8)', () => {
	test('uses the French segment order in French and the US one in English', () => {
		expect(localizedDatePlaceholder('fr')).toBe('jj/mm/aaaa');
		expect(localizedDatePlaceholder('fr-FR')).toBe('jj/mm/aaaa');
		expect(localizedDatePlaceholder('en')).toBe('mm/dd/yyyy');

		expect(formatLocalizedDate('2026-11-02', 'fr')).toBe('02/11/2026');
		expect(formatLocalizedDate('2026-11-02', 'en')).toBe('11/02/2026');
		expect(formatLocalizedDate(undefined, 'fr')).toBe('');
	});

	test('parses the locale format into the wire ISO date', () => {
		expect(parseLocalizedDate('02/11/2026', 'fr')).toBe('2026-11-02');
		expect(parseLocalizedDate('2/11/2026', 'fr')).toBe('2026-11-02');
		expect(parseLocalizedDate('11/02/2026', 'en')).toBe('2026-11-02');
		expect(parseLocalizedDate('2026-11-02', 'fr')).toBe('2026-11-02');
	});

	test('rejects impossible or partial dates instead of guessing', () => {
		expect(parseLocalizedDate('31/02/2026', 'fr')).toBeUndefined();
		expect(parseLocalizedDate('02/11', 'fr')).toBeUndefined();
		expect(parseLocalizedDate('aa/bb/cccc', 'fr')).toBeUndefined();
		expect(parseLocalizedDate('', 'fr')).toBe('');
	});

	test('round-trips every ISO date the filter can receive', () => {
		expect(
			parseLocalizedDate(formatLocalizedDate('2026-01-31', 'fr'), 'fr'),
		).toBe('2026-01-31');
		expect(
			parseLocalizedDate(formatLocalizedDate('2026-01-31', 'en'), 'en'),
		).toBe('2026-01-31');
	});
});
