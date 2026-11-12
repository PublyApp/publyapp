import { describe, expect, test } from 'vitest';

import {
	formatLocalizedTime,
	localizedTimePlaceholder,
	parseLocalizedTime,
} from './localized-time';

describe('localized time (#2410)', () => {
	test('French is 24 h, English is 12 h', () => {
		expect(formatLocalizedTime('10:30', 'fr')).toBe('10:30');
		expect(formatLocalizedTime('22:30', 'fr')).toBe('22:30');
		expect(formatLocalizedTime('10:30', 'en')).toBe('10:30 AM');
		expect(formatLocalizedTime('22:05', 'en')).toBe('10:05 PM');
		expect(formatLocalizedTime('00:15', 'en')).toBe('12:15 AM');
		expect(formatLocalizedTime('12:00', 'en')).toBe('12:00 PM');
		expect(localizedTimePlaceholder('fr')).toBe('hh:mm');
	});

	test('parses 24 h and am/pm into HH:mm', () => {
		expect(parseLocalizedTime('9:05')).toBe('09:05');
		expect(parseLocalizedTime('0905')).toBe('09:05');
		expect(parseLocalizedTime('9h05')).toBe('09:05');
		expect(parseLocalizedTime('10:30 pm')).toBe('22:30');
		expect(parseLocalizedTime('12:00 AM')).toBe('00:00');
		expect(parseLocalizedTime('  ')).toBe('');
	});

	test('refuses impossible times', () => {
		for (const raw of ['24:00', '10:60', '13:00 pm', '0:30 am', 'abc', '10']) {
			expect(parseLocalizedTime(raw)).toBeUndefined();
		}
	});
});
