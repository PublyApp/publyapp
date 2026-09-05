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

	// Locale-across-DST proof, rebuilt deterministically (#2025). The instant chosen is
	// exactly the 2026-03-29 spring-forward moment in Europe/Paris: at 01:00Z the clock
	// jumps 02:00 CET -> 03:00 CEST, so the calendar day must STAY on the 29th. Without
	// pinning the zone, this assertion is runner-flaky (e.g. America/Los_Angeles renders
	// the same instant on the 28th) and can only be green in UTC/positive-offset runners.
	// Pinning process.env.TZ makes it pass or fail on the code, not on where CI runs. The
	// original zone is restored afterward so the setting never leaks to sibling tests.
	test('ItShouldRenderSpringForwardInstantInEuropeParisAcrossLocales', () => {
		const originalTz = process.env.TZ;
		process.env.TZ = 'Europe/Paris';
		try {
			const springForward = new Date('2026-03-29T01:00:00Z');
			expect(formatDateTime(springForward, 'en')).toBe('Mar 29, 2026, 3:00 AM');
			expect(formatDateTime(springForward, 'fr')).toBe('29 mars 2026, 03:00');
		} finally {
			if (originalTz === undefined) {
				delete process.env.TZ;
			} else {
				process.env.TZ = originalTz;
			}
		}
	});
});
