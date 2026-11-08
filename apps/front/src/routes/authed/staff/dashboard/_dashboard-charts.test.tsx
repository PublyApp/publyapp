/**
 * @vitest-environment jsdom
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test } from 'vitest';

import {
	ColumnChart,
	Heatmap,
	LineChart,
	Sparkline,
} from './_dashboard-charts';

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
});

describe('Sparkline', () => {
	test('takes its 86×28 size from the bare `.kpi-spark` rule, not ghost-only CSS', () => {
		const { container } = render(<Sparkline values={[1, 3, 2]} />);
		const svg = container.querySelector('svg');

		// No size attributes: app.css's `.kpi-spark` is the size source — the
		// same contract the ghost test reads (fix8: the rule only covered
		// `.ghost-svg.kpi-spark`, so the real svg had no size at all).
		expect(svg?.getAttribute('viewBox')).toBe('0 0 86 28');
		expect(svg?.getAttribute('class')).toContain('kpi-spark');
		expect(svg?.hasAttribute('width')).toBe(false);
		expect(svg?.hasAttribute('height')).toBe(false);

		// Comments are stripped first so they don't ride along in the
		// captured selector.
		const appCss = readFileSync(
			path.resolve(import.meta.dirname, '../../../../styles/app.css'),
			'utf8',
		).replace(/\/\*[\s\S]*?\*\//g, '');
		const sizedRules = [...appCss.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter(
			([, , body]) =>
				/\bwidth:\s*86px\b/.test(body) && /\bheight:\s*28px\b/.test(body),
		);
		const selectors = sizedRules.flatMap(([, selector]) =>
			selector.split(',').map((entry) => entry.trim()),
		);

		// A selector the real svg (classes `kpi-spark shrink-0`) matches.
		expect(selectors).toContain('.kpi-spark');
	});
});
