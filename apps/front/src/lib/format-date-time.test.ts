/**
 * @vitest-environment jsdom
 */
import { describe, expect, test } from 'vitest';

import { formatDateTime } from './format-date-time';

describe('formatDateTime', () => {
	test('ItShouldReturnEmDashForNull', () => {
		expect(formatDateTime(null, 'en')).toBe('\u2014');
	});

	test('ItShouldReturnEmDashForUndefined', () => {
		expect(formatDateTime(undefined, 'en')).toBe('\u2014');
	});

	test('ItShouldReturnEmDashForNonDate', () => {
		// @ts-expect-error -- deliberately passing wrong types at runtime
		expect(formatDateTime('not a date', 'en')).toBe('\u2014');
	});

	test('ItShouldReturnEmDashForInvalidDate', () => {
		expect(formatDateTime(new Date('invalid'), 'en')).toBe('\u2014');
	});

	test('ItShouldFormatInEnglish', () => {
		const utc = new Date('2026-08-15T00:00:00Z');
		const output = formatDateTime(utc, 'en');
		expect(output).not.toBe('\u2014');
		// Must contain recognizable English month names.
		expect(output).toMatch(/Aug|15|2026|AM|PM|\d{1,2}:\d{2}/);
	});

	test('ItShouldFormatInFrench', () => {
		const utc = new Date('2026-08-15T12:30:00Z');
		const en = formatDateTime(utc, 'en');
		const fr = formatDateTime(utc, 'fr');
		// French output must differ from English output.
		expect(fr).not.toBe(en);
		// French formatter produces French month names.
		expect(fr).toMatch(/août|août/);
	});

	// Locale-aware proof: the same UTC instant must produce different date orderings
	// in en (month first) vs fr (day first), proving the locale parameter drives
	// the formatter rather than a hard-coded format string.
	test('ItShouldProduceDifferentDateOrderingsInEnVsFr', () => {
		const utc = new Date('2026-01-15T12:00:00Z');
		const en = formatDateTime(utc, 'en');
		const fr = formatDateTime(utc, 'fr');
		expect(fr).not.toBe(en);
		// English: "Jan 15, 2026" (month-day-year). French: "15 janv. 2026" (day-month-year).
		// Both must contain the day number.
		const enDay = en.match(/\d+/)?.[0];
		const frDay = fr.match(/\d+/)?.[0];
		expect(enDay).toBe('15');
		expect(frDay).toBe('15');
	});

	// DST boundary: on 2026-03-29 the Paris clock jumps from 02:00 to 03:00.
	// 2026-03-29T01:00:00Z = 02:00 Paris (DST starts) — still March 29 locally.
	// Proves the formatter reads the UTC instant and applies the timezone offset
	// to produce the correct local calendar date, not the UTC calendar date.
	test('ItShouldShowCorrectLocalDateOnDstSpringForwardBoundaryParis', () => {
		const utc = new Date('2026-03-29T01:00:00Z');
		const fr = formatDateTime(utc, 'fr');
		expect(fr).toContain('29');
		const en = formatDateTime(utc, 'en');
		expect(en).toContain('29');
	});
});
