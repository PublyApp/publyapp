import { describe, expect, test } from 'vitest';

import {
	dashboardWindow,
	periodStart,
	previousPeriod,
	todayIso,
} from './_dashboard-filters';

const daysBetween = (start: string, end: string): number =>
	Math.round((Date.parse(end) - Date.parse(start)) / 86_400_000) + 1;

/** A fixed local noon: the calendar day is the same in every zone. */
const NOW = new Date(2026, 10, 7, 12);

describe('dashboard period windows', () => {
	test('« 30 derniers jours » is exactly 30 days, today included (B MA-1)', () => {
		expect(periodStart('30d', NOW)).toBe('2026-10-09');
		expect(daysBetween(periodStart('30d', NOW), todayIso(NOW))).toBe(30);
	});

	test('« 7 derniers jours » is exactly 7 days, today included', () => {
		expect(periodStart('7d', NOW)).toBe('2026-11-01');
		expect(daysBetween(periodStart('7d', NOW), todayIso(NOW))).toBe(7);
	});

	test('« 90 derniers jours » is exactly 90 days, today included', () => {
		expect(periodStart('90d', NOW)).toBe('2026-08-10');
		expect(daysBetween(periodStart('90d', NOW), todayIso(NOW))).toBe(90);
	});

	test('« 12 derniers mois » starts 12 calendar months before today', () => {
		expect(periodStart('12m', NOW)).toBe('2025-11-07');
	});

	test('the window every card reads ends today and starts at the preset', () => {
		expect(dashboardWindow('30d', NOW)).toEqual({
			startDate: '2026-10-09',
			endDate: '2026-11-07',
		});
	});

	test('the delta compares the immediately preceding window of the same length', () => {
		expect(previousPeriod('30d', NOW)).toEqual({
			startDate: '2026-09-09',
			endDate: '2026-10-08',
		});
		// The previous window is exactly as long as the current one, and it
		// ends the day before the current one starts.
		const current = dashboardWindow('30d', NOW);
		const previous = previousPeriod('30d', NOW);
		expect(daysBetween(previous.startDate, previous.endDate)).toBe(
			daysBetween(current.startDate, current.endDate),
		);
		expect(previous.endDate).toBe(
			new Date(Date.parse(`${current.startDate}T00:00:00Z`) - 86_400_000)
				.toISOString()
				.slice(0, 10),
		);
	});
});
