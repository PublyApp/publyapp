/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test } from 'vitest';

import {
	ColumnChart,
	Heatmap,
	LineChart,
	Sparkline,
} from './_dashboard-charts';
import { addIsoDays } from './_dashboard-filters';

afterEach(cleanup);

const SERIES_WIDTH = 760;

describe('ColumnChart', () => {
	test('keeps every one of 365 daily points inside the viewBox (A-5)', () => {
		const points = Array.from({ length: 365 }, (_, index) => ({
			label: `day-${index}`,
			value: index % 7,
		}));
		const { container } = render(
			<ColumnChart points={points} locale="en" label="Column chart" />,
		);

		const bars = Array.from(container.querySelectorAll('rect'));
		expect(bars).toHaveLength(365);
		for (const bar of bars) {
			const x = Number(bar.getAttribute('x'));
			const width = Number(bar.getAttribute('width'));
			expect(x + width).toBeLessThanOrEqual(SERIES_WIDTH);
			expect(width).toBeGreaterThanOrEqual(0.4);
		}
		// The last bar sits at the right edge instead of being clipped away.
		const last = bars.at(-1);
		expect(Number(last?.getAttribute('x'))).toBeGreaterThan(700);
	});

	test('names the chart from the caller’s translated label (B ME-5)', () => {
		render(
			<ColumnChart
				points={[{ label: '1 nov.', value: 2 }]}
				locale="fr"
				label="Graphique en colonnes"
			/>,
		);

		expect(
			screen.getByRole('img', { name: 'Graphique en colonnes' }),
		).toBeTruthy();
	});
});

describe('LineChart', () => {
	test('names the chart from the caller’s translated label', () => {
		render(
			<LineChart
				points={[{ label: '1 nov.', value: 2 }]}
				locale="fr"
				label="Graphique d'évolution"
			/>,
		);

		expect(
			screen.getByRole('img', { name: "Graphique d'évolution" }),
		).toBeTruthy();
	});
});

describe('Heatmap', () => {
	const week = Array.from({ length: 7 }, (_, index) => ({
		// 2024-01-01 is a Monday: no padding column.
		date: `2024-01-0${index + 1}`,
		value: index,
	}));

	test('a zero-event day uses the empty colour, never level 1 (A-8)', () => {
		const { container } = render(
			<Heatmap days={week} locale="en" label="Activity heatmap" />,
		);

		const first = container.querySelector('rect');
		expect(first?.getAttribute('fill')).toBe('var(--publy-chart-empty)');
		// A non-zero day still takes a level colour.
		const second = container.querySelectorAll('rect')[1];
		expect(second?.getAttribute('fill')).toBe('var(--publy-chart-seq-1)');
	});

	test('weekday labels follow the locale, not a hardcoded French list (B ME-2)', () => {
		render(<Heatmap days={week} locale="en" label="Activity heatmap" />);

		expect(screen.getByText('Tue')).toBeTruthy();
		expect(screen.getByText('Thu')).toBeTruthy();
		expect(screen.getByText('Sat')).toBeTruthy();
		expect(screen.queryByText('Mar')).toBeNull();
	});

	test('names the chart from the caller’s translated label (B ME-5)', () => {
		render(<Heatmap days={week} locale="fr" label="Carte d'activité" />);

		expect(screen.getByRole('img', { name: "Carte d'activité" })).toBeTruthy();
	});

	test('the month label sits on the week column holding the 1st, off-Monday starts included (#2339 fix9 ME-3)', () => {
		// The shipped heatmap window ends on Saturday 2026-11-08: 365 days
		// start on Sunday 2025-11-09, so column 0 has no Monday cell — the
		// padded week must still count, or every later label shifts left.
		const days = Array.from({ length: 365 }, (_, index) => ({
			date: addIsoDays('2025-11-09', index),
			value: 1,
		}));
		const { container } = render(
			<Heatmap days={days} locale="fr" label="Carte d'activité" />,
		);

		// Day 23 is 2025-12-01 (a Monday): « déc. » belongs to that column.
		const decemberRect = container.querySelectorAll('rect')[22];
		const decemberLabel = new Intl.DateTimeFormat('fr', {
			month: 'short',
			timeZone: 'UTC',
		}).format(new Date('2025-12-01T12:00:00Z'));
		const label = Array.from(container.querySelectorAll('text')).find(
			(node) => node.textContent === decemberLabel,
		);

		expect(decemberRect).toBeDefined();
		expect(label).toBeDefined();
		expect(label?.getAttribute('x')).toBe(decemberRect?.getAttribute('x'));
	});
});

describe('Sparkline', () => {
	test('keeps its 86×28 size inside a footer that shrinks every svg', () => {
		const { container } = render(<Sparkline values={[1, 3, 2]} />);
		const svg = container.querySelector('svg');

		// Inline style, so the footer's `[&_svg]:size-3.5` utility cannot win.
		expect(svg?.style.width).toBe('86px');
		expect(svg?.style.height).toBe('28px');
	});
});
