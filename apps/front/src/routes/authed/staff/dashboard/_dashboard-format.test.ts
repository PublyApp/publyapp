import { afterEach, describe, expect, test } from 'vitest';

import {
	formatPeriodRange,
	seriesDelta,
	seriesLastValue,
	seriesTotal,
} from './_dashboard-format';

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

describe('seriesLastValue', () => {
	test('is the level the window ends on, a real zero included', () => {
		expect(seriesLastValue([{ value: 3 }, { value: 9 }])).toBe(9);
		expect(seriesLastValue([{ value: 3 }, { value: 0 }])).toBe(0);
	});

	test('a series with no point is unknown', () => {
		expect(seriesLastValue([])).toBeUndefined();
		expect(seriesLastValue(undefined)).toBeUndefined();
		expect(seriesLastValue(null)).toBeUndefined();
	});
});

describe('seriesDelta', () => {
	test('goes up or down against the previous figure', () => {
		expect(seriesDelta(110, 100, 'en')).toEqual({
			label: '+10%',
			direction: 'up',
		});
		expect(seriesDelta(90, 100, 'en')?.direction).toBe('down');
	});

	test('equality reads as up with a zero change', () => {
		expect(seriesDelta(100, 100, 'en')).toEqual({
			label: '+0%',
			direction: 'up',
		});
	});

	test('has no delta when a side is unknown or the previous figure is 0', () => {
		expect(seriesDelta(undefined, 100, 'en')).toBeUndefined();
		expect(seriesDelta(100, undefined, 'en')).toBeUndefined();
		expect(seriesDelta(100, 0, 'en')).toBeUndefined();
	});
});
