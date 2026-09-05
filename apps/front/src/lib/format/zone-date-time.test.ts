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
});
