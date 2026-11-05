import { describe, expect, test } from 'vitest';

import {
	historyDateLabel,
	historyDayKey,
	historyDayLabel,
	historyTimeLabel,
} from './history-date';

const labels = {
	today: 'Aujourd’hui',
	yesterday: 'Hier',
	unknown: 'Date inconnue',
};

describe('history day label', () => {
	test('names today and yesterday, then spells out the date', () => {
		const now = new Date(2026, 9, 27, 15, 0);
		const label = (date: Date) =>
			historyDayLabel({ date, now, locale: 'fr', ...labels });

		expect(label(new Date(2026, 9, 27, 0, 5))).toBe('Aujourd’hui');
		expect(label(new Date(2026, 9, 26, 23, 55))).toBe('Hier');
		expect(label(new Date(2026, 9, 25, 12, 0))).toBe('Dimanche 25 octobre');
	});

	test('uses the unknown label for a missing date', () => {
		expect(
			historyDayLabel({
				date: null,
				now: new Date(2026, 9, 27),
				locale: 'fr',
				...labels,
			}),
		).toBe('Date inconnue');
	});

	test('groups by local calendar day', () => {
		expect(historyDayKey(new Date(2026, 9, 27, 0, 1))).toBe('2026-10-27');
		expect(historyDayKey(new Date(2026, 9, 27, 23, 59))).toBe('2026-10-27');
		expect(historyDayKey(null)).toBe('unknown');
	});
});

describe('history time label', () => {
	test('prints a 24-hour clock time', () => {
		expect(historyTimeLabel(new Date(2026, 9, 27, 7, 2), 'fr')).toBe('07:02');
	});

	test('prints the no-value dash for a missing date', () => {
		expect(historyTimeLabel(null, 'fr')).toBe('—');
	});

	test('prints the day/month/year of a wire date for the custom period chip', () => {
		expect(historyDateLabel('2026-10-01')).toBe('01/10/2026');
		expect(historyDateLabel(undefined)).toBe('—');
		expect(historyDateLabel('not-a-date')).toBe('—');
	});
});
