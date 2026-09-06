/**
 * @vitest-environment jsdom
 */
import { describe, expect, test } from 'vitest';

import { formatInZone } from './zone-date-time';

describe('formatInZone', () => {
	test('renders an English date, weekday, and time in the requested zone', () => {
		expect(
			formatInZone(new Date('2026-08-31T18:30:00.000Z'), 'Europe/Paris', 'en'),
		).toBe('Mon, Aug 31, 2026, 8:30 PM');
	});

	test('renders a French date, weekday, and time in the requested zone', () => {
		expect(
			formatInZone(new Date('2026-08-31T18:30:00.000Z'), 'Europe/Paris', 'fr'),
		).toBe('lun. 31 août 2026, 20:30');
	});

	test('returns an em dash for unusable values or time zones', () => {
		expect(formatInZone(null, 'Europe/Paris', 'en')).toBe('—');
		expect(formatInZone('not-a-date', 'Europe/Paris', 'fr')).toBe('—');
		expect(
			formatInZone(
				new Date('2026-08-31T18:30:00.000Z'),
				'not/a-time-zone',
				'en',
			),
		).toBe('—');
	});

	test('keeps viewer-local undefined distinct from an unavailable null zone', () => {
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
});
