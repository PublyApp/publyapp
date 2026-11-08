import { afterEach, describe, expect, test } from 'vitest';

import { formatPeriodRange, seriesTotal } from './_dashboard-format';

const originalTimeZone = process.env.TZ;

afterEach(() => {
	if (originalTimeZone === undefined) {
		delete process.env.TZ;
		return;
	}
	process.env.TZ = originalTimeZone;
});

describe('formatPeriodRange', () => {
	test('prints the calendar day west of UTC, never the day before (A-1)', () => {
		// A Montreal staff member: formatting `2026-10-09` in the local zone
		// would print « 8 oct. » (the UTC-midnight instant is the 8th locally).
		process.env.TZ = 'America/Montreal';

		expect(formatPeriodRange('2026-10-09', '2026-11-07', 'fr')).toBe(
			'9 oct. – 7 nov. 2026',
		);
	});

	test('the same range reads the same in UTC and west of UTC', () => {
		process.env.TZ = 'UTC';
		const utc = formatPeriodRange('2026-10-09', '2026-11-07', 'fr');
		process.env.TZ = 'America/Montreal';

		expect(formatPeriodRange('2026-10-09', '2026-11-07', 'fr')).toBe(utc);
	});
});

describe('seriesTotal', () => {
	test('sums the served points, a real zero included', () => {
		expect(seriesTotal([{ value: 3 }, { value: 0 }, { value: 2 }])).toBe(5);
	});

	test('a series with no point is unknown, not a real 0', () => {
		expect(seriesTotal([])).toBeUndefined();
		expect(seriesTotal(undefined)).toBeUndefined();
		expect(seriesTotal(null)).toBeUndefined();
	});
});
