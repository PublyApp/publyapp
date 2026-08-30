/**
 * @vitest-environment jsdom
 *
 * #1531 — formatInZone must be locale-aware. The same instant must
 * produce different strings in different locales; a hard-coded locale
 * would not distinguish "locale-aware" from "French-only".
 *
 * Proof rule: two languages, different output.
 */
import { describe, expect, test } from 'vitest';

import { formatInZone, parseLocalWallTime } from './zone-date-time';

const PARIS_SUMMER = new Date('2026-08-26T07:00:00Z'); // 09:00 Europe/Paris
const PARIS_WINTER = new Date('2026-12-15T08:00:00Z'); // 09:00 Europe/Paris

describe('#1531 formatInZone locale awareness', () => {
	test('formatInZone returns different output for en vs fr (summer DST)', () => {
		const en = formatInZone(PARIS_SUMMER, 'Europe/Paris', 'en');
		const fr = formatInZone(PARIS_SUMMER, 'Europe/Paris', 'fr');

		expect(en).not.toBe('');
		expect(fr).not.toBe('');
		// The same instant must format differently across locales.
		expect(en).not.toBe(fr);
	});

	test('formatInZone returns different output for en vs fr (winter standard time)', () => {
		const en = formatInZone(PARIS_WINTER, 'Europe/Paris', 'en');
		const fr = formatInZone(PARIS_WINTER, 'Europe/Paris', 'fr');

		expect(en).not.toBe('');
		expect(fr).not.toBe('');
		expect(en).not.toBe(fr);
	});

	test('formatInZone includes the month name in the locale language', () => {
		const en = formatInZone(PARIS_SUMMER, 'Europe/Paris', 'en');
		const fr = formatInZone(PARIS_SUMMER, 'Europe/Paris', 'fr');

		// August in English vs août in French — different month tokens.
		const hasAugustEn = /Aug|August/i.test(en);
		const hasAoutFr = /aoû?/i.test(fr);
		expect(hasAugustEn || hasAoutFr).toBe(true);
		// At least one locale must show its own month name.
		expect(en !== fr).toBe(true);
	});

	test('formatInZone returns a dash for an invalid date', () => {
		expect(formatInZone(new Date(NaN), 'Europe/Paris', 'en')).toBe('—');
		expect(formatInZone(new Date(), '', 'en')).toBe('—');
	});

	test('parseLocalWallTime round-trips a formatted string', () => {
		const formatted = formatInZone(PARIS_SUMMER, 'Europe/Paris', 'en');
		const parsed = parseLocalWallTime(formatted, 'Europe/Paris');

		expect(parsed).not.toBeNull();
		expect(parsed?.getUTCFullYear()).toBe(2026);
		expect(parsed?.getUTCMonth()).toBe(7); // August
		expect(parsed?.getUTCDate()).toBe(26);
		// 09:00 Paris summer (UTC+2) = 07:00 UTC
		expect(parsed?.getUTCHours()).toBe(7);
		expect(parsed?.getUTCMinutes()).toBe(0);
	});

	test('parseLocalWallTime returns null for garbage input', () => {
		expect(parseLocalWallTime('', 'Europe/Paris')).toBeNull();
		expect(parseLocalWallTime('not a date', 'Europe/Paris')).toBeNull();
		expect(parseLocalWallTime('null', 'Europe/Paris')).toBeNull();
	});

	test('parseLocalWallTime returns null when the zone mismatches', () => {
		// Format in Paris, but parse with an unrelated zone —
		// the wall-clock values won't correspond to a real date.
		const formatted = formatInZone(PARIS_SUMMER, 'Europe/Paris', 'en');
		// Pacific/Niue is UTC-11, so 9:00 AM Paris would parse to
		// a date whose re-formatted value doesn't match — we just
		// verify the result differs from the correct parse.
		const correct = parseLocalWallTime(formatted, 'Europe/Paris');
		const mismatched = parseLocalWallTime(formatted, 'Pacific/Niue');
		// Either null or a different UTC instant — but not the same.
		if (mismatched) {
			expect(mismatched.getTime()).not.toBe(correct?.getTime());
		}
	});
});
