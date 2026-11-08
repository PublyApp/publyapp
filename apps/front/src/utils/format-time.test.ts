/**
 * @vitest-environment jsdom
 */
import { describe, expect, test } from 'vitest';

import {
	formatCalendarDay,
	formatDateTime,
	formatDayMonth,
	formatInZone,
	formatLongWeekdayDate,
	formatMonthShort,
	formatMonthYear,
	formatShortDate,
	formatTimeOfDay,
	formatWeekdayShort,
	getBrowserTimeZone,
	getRelativeTimeParts,
} from './format-time';

describe('format-time', () => {
	test('returns an em dash for missing, non-Date, and invalid dates', () => {
		expect(formatDateTime(null, 'en')).toBe('—');
		expect(formatDateTime(undefined, 'en')).toBe('—');
		// @ts-expect-error -- deliberately passing wrong types at runtime
		expect(formatDateTime('not a date', 'en')).toBe('—');
		expect(formatDateTime(new Date('invalid'), 'en')).toBe('—');
	});

	test('preserves locale-aware date and time formatting', () => {
		const instant = new Date('2026-08-15T12:30:00Z');
		const english = formatDateTime(instant, 'en', { timeZone: 'UTC' });
		const french = formatDateTime(instant, 'fr', { timeZone: 'UTC' });

		expect(english).toBe('Aug 15, 2026, 12:30 PM');
		expect(french).toBe('15 août 2026, 12:30');
	});

	test('preserves short-date and month-year formatting', () => {
		const instant = new Date('2026-08-15T12:30:00Z');

		expect(formatShortDate(instant, 'en', { timeZone: 'UTC' })).toBe(
			'Aug 15, 2026',
		);
		expect(formatMonthYear(instant, 'en', { timeZone: 'UTC' })).toBe(
			'Aug 2026',
		);
		expect(formatShortDate(new Date('invalid'), 'en')).toBe('—');
		expect(formatMonthYear(null, 'en')).toBe('—');
	});

	test('preserves coarse relative-time parts', () => {
		const now = new Date('2026-08-15T12:30:00Z');

		expect(getRelativeTimeParts(new Date('2026-08-15T12:29:30Z'), now)).toEqual(
			{
				key: 'minutes-ago',
				count: 1,
			},
		);
		expect(getRelativeTimeParts(new Date('2026-08-15T10:30:00Z'), now)).toEqual(
			{
				key: 'hours-ago',
				count: 2,
			},
		);
		expect(getRelativeTimeParts(new Date('invalid'), now)).toBeNull();
	});

	test('formats an instant with a weekday in an explicit IANA zone', () => {
		expect(
			formatInZone(new Date('2026-08-31T18:30:00.000Z'), 'Europe/Paris', 'en'),
		).toBe('Mon, Aug 31, 2026, 8:30 PM');
	});

	test('formats a calendar day with a weekday in the requested locale', () => {
		expect(formatCalendarDay('2026-08-01', 'fr')).toBe('sam. 1 août 2026');
	});

	test('formats a short month, a short weekday, and a day+month in UTC', () => {
		const date = new Date('2026-10-09T00:00:00Z');

		expect(formatMonthShort(date, 'fr')).toBe('oct.');
		expect(formatMonthShort(date, 'en')).toBe('Oct');
		expect(formatWeekdayShort(date, 'fr')).toBe('ven.');
		expect(formatWeekdayShort(date, 'en')).toBe('Fri');
		expect(formatDayMonth(date, 'fr')).toBe('9 oct.');
		expect(formatDayMonth(date, 'en')).toBe('Oct 9');
		expect(formatMonthShort(null, 'fr')).toBe('—');
		expect(formatWeekdayShort(new Date('invalid'), 'en')).toBe('—');
		expect(formatDayMonth(null, 'en')).toBe('—');
	});

	test('formats the spelled-out history day and a 24-hour clock time', () => {
		const instant = new Date('2026-10-25T07:02:00Z');

		expect(formatLongWeekdayDate(instant, 'fr', { timeZone: 'UTC' })).toBe(
			'dimanche 25 octobre',
		);
		expect(formatTimeOfDay(instant, 'fr', { timeZone: 'UTC' })).toBe('07:02');
		expect(formatLongWeekdayDate(null, 'fr')).toBe('—');
		expect(formatTimeOfDay(new Date('invalid'), 'fr')).toBe('—');
	});

	test('keeps viewer-local undefined distinct from unavailable null zone', () => {
		const originalTz = process.env.TZ;
		process.env.TZ = 'America/New_York';
		try {
			const instant = new Date('2026-03-29T08:00:00.000Z');
			expect(formatInZone(instant, undefined, 'en')).toBe(
				'Sun, Mar 29, 2026, 4:00 AM',
			);
			expect(formatInZone(instant, null, 'en')).toBe('—');
		} finally {
			if (originalTz === undefined) {
				delete process.env.TZ;
			} else {
				process.env.TZ = originalTz;
			}
		}
	});

	test('renders the Europe/Paris spring-forward instant across locales', () => {
		const originalTz = process.env.TZ;
		process.env.TZ = 'Europe/Paris';
		try {
			const springForward = new Date('2026-03-29T01:00:00Z');
			expect(formatDateTime(springForward, 'en', { timeZone: undefined })).toBe(
				'Mar 29, 2026, 3:00 AM',
			);
			expect(formatDateTime(springForward, 'fr', { timeZone: undefined })).toBe(
				'29 mars 2026, 03:00',
			);
		} finally {
			if (originalTz === undefined) {
				delete process.env.TZ;
			} else {
				process.env.TZ = originalTz;
			}
		}
	});

	test('returns an em dash for an invalid IANA zone', () => {
		expect(
			formatInZone(new Date('2026-08-31T18:30:00.000Z'), 'not/a-zone', 'en'),
		).toBe('—');
	});

	test('getBrowserTimeZone names a zone Intl accepts, never an empty string', () => {
		const zone = getBrowserTimeZone();

		expect(zone.length).toBeGreaterThan(0);
		expect(
			() => new Intl.DateTimeFormat('en', { timeZone: zone }),
		).not.toThrow();
	});
});
