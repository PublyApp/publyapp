/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string) => key,
		i18n: { resolvedLanguage: 'en', language: 'en' },
	}),
}));

// eslint-disable-next-line import/first -- must follow the vi.mock call above
import {
	GHOST_HEIGHT,
	GhostAxis,
	GhostBars,
	GhostDonut,
	GhostHBars,
	GhostHeatmap,
	GhostLine,
	GhostList,
	GhostSpark,
	GhostStacked,
	GhostTag,
} from './_chart-ghost';
// eslint-disable-next-line import/first -- must follow the vi.mock call above
import { CHART_HEIGHT } from './_dashboard-charts';

afterEach(cleanup);

const ghostKinds: ReadonlyArray<readonly [string, () => ReactElement]> = [
	['line', () => <GhostLine />],
	['axis', () => <GhostAxis />],
	['bars', () => <GhostBars />],
	['hbars', () => <GhostHBars />],
	['stacked', () => <GhostStacked />],
	['heatmap', () => <GhostHeatmap />],
	['donut', () => <GhostDonut />],
	['list', () => <GhostList />],
	['spark', () => <GhostSpark />],
];

const svgsOf = (container: HTMLElement): NodeListOf<SVGSVGElement> =>
	container.querySelectorAll('svg');

describe('ghost charts', () => {
	test('every kind renders its shapes as decorative SVG', () => {
		for (const [kind, renderGhost] of ghostKinds) {
			const { container, unmount } = render(renderGhost());
			const svgs = svgsOf(container);
			expect(svgs.length, kind).toBeGreaterThan(0);
			for (const svg of svgs) {
				expect(svg.getAttribute('aria-hidden'), kind).toBe('true');
				expect(svg.getAttribute('focusable'), kind).toBe('false');
			}
			unmount();
		}
	});

	test('the tag is real DOM text, not part of the SVG', () => {
		render(<GhostTag />);
		expect(screen.getByText('dashboard-ghost-tag')).toBeTruthy();
		expect(screen.getByText('dashboard-ghost-tag').closest('svg')).toBeNull();
	});

	test('a ghost is deterministic: the same kind draws the same shapes twice', () => {
		const first = render(<GhostBars />).container.innerHTML;
		cleanup();
		const second = render(<GhostBars />).container.innerHTML;
		expect(second).toBe(first);
	});

	test('the line ghost keeps the real line chart height (no jump)', () => {
		const { container } = render(<GhostLine />);
		const svg = container.querySelector('svg');

		expect(svg?.getAttribute('viewBox')).toBe(`0 0 760 ${CHART_HEIGHT}`);
		expect(GHOST_HEIGHT.line).toBe(CHART_HEIGHT);
	});

	test('the bar ghost plus its axis fills the real column chart', () => {
		const { container } = render(
			<>
				<GhostBars />
				<GhostAxis />
			</>,
		);
		const [bars, axis] = svgsOf(container);

		// The real `ColumnChart` is a 180 px body with no axis row of its own;
		// the ghost spends 24 px of that height on the axis.
		expect(Number(bars?.getAttribute('height'))).toBe(GHOST_HEIGHT.bars);
		expect(Number(axis?.getAttribute('height'))).toBe(GHOST_HEIGHT.axis);
		expect(GHOST_HEIGHT.bars + GHOST_HEIGHT.axis).toBe(180);
	});

	test('the horizontal bars keep the real rows (35 px rows, 16 px gaps)', () => {
		const { container } = render(<GhostHBars rows={4} />);
		expect(Number(container.querySelector('svg')?.getAttribute('height'))).toBe(
			4 * 35 + 3 * 16,
		);
	});

	test('the stacked ghost keeps the real bar + table height', () => {
		const { container } = render(<GhostStacked />);
		const [bar, table] = svgsOf(container);

		expect(Number(bar?.getAttribute('height'))).toBe(GHOST_HEIGHT.stackedBar);
		expect(Number(table?.getAttribute('height'))).toBe(
			GHOST_HEIGHT.stackedTable,
		);
		// 12 px share bar + 214 px table (34 px head, five 36 px rows).
		expect(GHOST_HEIGHT.stackedTable).toBe(34 + 5 * 36);
	});

	test('the donut and heatmap ghosts keep their real sizes', () => {
		const donut = render(<GhostDonut />).container;
		const donutSvgs = svgsOf(donut);
		expect(donutSvgs[0]?.getAttribute('width')).toBe(
			String(GHOST_HEIGHT.donutRing),
		);
		expect(Number(donutSvgs[1]?.getAttribute('height'))).toBe(
			GHOST_HEIGHT.donutLegend,
		);
		cleanup();

		const heatmap = render(<GhostHeatmap />).container;
		expect(Number(heatmap.querySelector('svg')?.getAttribute('height'))).toBe(
			GHOST_HEIGHT.heatmap,
		);
	});

	test('the list ghost reserves five rows', () => {
		const { container } = render(<GhostList rows={5} rowHeight={56} />);
		expect(Number(container.querySelector('svg')?.getAttribute('height'))).toBe(
			280,
		);
	});

	test('the spark ghost keeps the real sparkline height, narrower', () => {
		const { container } = render(<GhostSpark />);
		const svg = container.querySelector('svg');

		expect(svg?.getAttribute('viewBox')).toBe('0 0 86 28');
		expect(GHOST_HEIGHT.spark).toBe(28);
		expect(svg?.getAttribute('class')).toContain('kpi-spark');
	});
});
