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

	test('the line ghost keeps the line chart height it stands for (no jump)', () => {
		const { container } = render(<GhostLine />);
		const svg = container.querySelector('svg');

		expect(svg?.getAttribute('viewBox')).toBe('0 0 760 220');
	});

	test('the bar ghost plus its axis fills the real column chart', () => {
		const { container } = render(
			<>
				<GhostBars />
				<GhostAxis />
			</>,
		);
		const [bars, axis] = svgsOf(container);

		// The bar body the ghost stands for is 180 px tall; the ghost spends
		// 24 px of it on the axis.
		expect(Number(bars?.getAttribute('height'))).toBe(156);
		expect(Number(axis?.getAttribute('height'))).toBe(24);
		expect(156 + 24).toBe(180);
	});

	test('the horizontal bars keep the real rows (34,8 px rows, 15 px gaps)', () => {
		const { container } = render(<GhostHBars rows={4} />);
		expect(Number(container.querySelector('svg')?.getAttribute('height'))).toBe(
			4 * 34.8 + 3 * 15,
		);
	});

	test('the stacked ghost keeps the real bar + table height', () => {
		const { container } = render(<GhostStacked />);
		const [bar, table] = svgsOf(container);

		expect(Number(bar?.getAttribute('height'))).toBe(12);
		expect(Number(table?.getAttribute('height'))).toBe(214);
		// 12 px share bar + 214 px table (34 px head, five 36 px rows).
		expect(214).toBe(34 + 5 * 36);
	});

	test('the donut and heatmap ghosts keep their real sizes', () => {
		const donut = render(<GhostDonut />).container;
		const donutSvgs = svgsOf(donut);
		expect(donutSvgs[0]?.getAttribute('width')).toBe('172');
		expect(Number(donutSvgs[1]?.getAttribute('height'))).toBe(96);
		cleanup();

		const heatmap = render(<GhostHeatmap />).container;
		expect(Number(heatmap.querySelector('svg')?.getAttribute('height'))).toBe(
			137,
		);
	});

	test('two heatmap ghosts never share an SVG id (N13)', () => {
		const { container } = render(
			<>
				<GhostHeatmap />
				<GhostHeatmap />
			</>,
		);
		const ids = [...container.querySelectorAll('[id]')].map((node) =>
			node.getAttribute('id'),
		);
		const references = [...container.querySelectorAll('[fill^="url("]')].map(
			(node) => node.getAttribute('fill'),
		);

		expect(ids.length).toBe(6);
		expect(new Set(ids).size).toBe(ids.length);
		for (const reference of references) {
			expect(ids).toContain(reference?.slice(5, -1));
		}
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

		// Inline style, so the KPI footer's `[&_svg]:size-3.5` cannot win.
		expect(svg?.getAttribute('viewBox')).toBe('0 0 86 28');
		expect(svg?.style.width).toBe('62px');
		expect(svg?.style.height).toBe('28px');
	});
});
