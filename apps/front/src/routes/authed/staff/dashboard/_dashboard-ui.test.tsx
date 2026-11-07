/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { TestLabelMap } from '~/lib/testing/test-label-map';

const EN_LABELS: TestLabelMap = {
	'dashboard-ghost-tag': 'No data yet',
	'dashboard-view-chart': 'Chart',
	'dashboard-view-table': 'Table',
	'dashboard-view-toggle': 'Display',
};

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string) => EN_LABELS[key] ?? key,
		i18n: { resolvedLanguage: 'en', language: 'en' },
	}),
}));

vi.mock('@tanstack/react-router', () => ({
	useRouter: () => ({ invalidate: vi.fn() }),
}));

// eslint-disable-next-line import/first -- must follow the vi.mock calls above
import { ChartCard } from './_dashboard-ui';

afterEach(cleanup);

const baseProps = {
	testId: 'staff-dashboard-card',
	label: 'Card',
	icon: null,
	note: 'The real description',
};

describe('ChartCard series', () => {
	test('a ready series renders its real chart, even all zeros', () => {
		render(
			<ChartCard
				{...baseProps}
				series={{
					status: 'ready',
					chart: <span data-testid="real-chart">0</span>,
					table: <span>table rows</span>,
				}}
			/>,
		);

		const card = screen.getByTestId('staff-dashboard-card');
		expect(within(card).getByTestId('real-chart').textContent).toBe('0');
		expect(within(card).getByText('The real description')).toBeTruthy();
		expect(within(card).getByRole('button', { name: 'Table' })).toBeTruthy();
		expect(within(card).queryByText('No data yet')).toBeNull();
	});

	test('an unavailable series draws its own ghost, its sentence and the tag', () => {
		render(
			<ChartCard
				{...baseProps}
				series={{
					status: 'unavailable',
					sentence: 'The curve will be drawn here.',
					ghost: <svg aria-hidden="true" data-testid="ghost-chart" />,
				}}
			/>,
		);

		const card = screen.getByTestId('staff-dashboard-card');
		expect(within(card).getByTestId('ghost-chart')).toBeTruthy();
		expect(within(card).getByText('No data yet')).toBeTruthy();
		expect(
			within(card).getByText('The curve will be drawn here.'),
		).toBeTruthy();
		// The description is replaced by the sentence, and there is no table to
		// switch to: the switch is hidden, not disabled.
		expect(within(card).queryByText('The real description')).toBeNull();
		expect(within(card).queryByRole('button', { name: 'Table' })).toBeNull();
		expect(within(card).queryByRole('button', { name: 'Chart' })).toBeNull();
	});

	test('a failed request keeps the existing error state, not a ghost', () => {
		render(
			<ChartCard
				{...baseProps}
				series={{
					status: 'unavailable',
					sentence: 'The curve will be drawn here.',
					ghost: <svg aria-hidden="true" />,
				}}
				state={{
					isPending: false,
					error: new Error('boom'),
					onRetry: vi.fn(),
				}}
			/>,
		);

		expect(screen.getByTestId('staff-dashboard-card-error')).toBeTruthy();
		expect(screen.queryByText('No data yet')).toBeNull();
	});

	test('a pending query keeps the skeleton', () => {
		render(
			<ChartCard
				{...baseProps}
				series={{
					status: 'unavailable',
					sentence: 'The curve will be drawn here.',
					ghost: <svg aria-hidden="true" />,
				}}
				state={{ isPending: true, error: null, onRetry: vi.fn() }}
			/>,
		);

		expect(screen.getByTestId('staff-dashboard-card-skeleton')).toBeTruthy();
	});

	test('a ghost card keeps the header height its switch occupied', () => {
		// jsdom has no layout: assert the reserved heights/classes instead of
		// measured pixels. A card with the switch is 40 px tall naturally; a
		// ghost card hides the switch and pins the same 40 px (`min-h-10`).
		const ready = render(
			<ChartCard
				{...baseProps}
				testId="card-with-switch"
				series={{
					status: 'ready',
					chart: <span />,
					table: <span />,
				}}
			/>,
		);
		const readyHeader = ready.container.querySelector(
			'[data-slot="section-card-header"]',
		);
		expect(readyHeader?.className).not.toContain('min-h-10');
		cleanup();

		const ghost = render(
			<ChartCard
				{...baseProps}
				testId="card-ghost"
				series={{
					status: 'unavailable',
					sentence: 'The curve will be drawn here.',
					ghost: <svg aria-hidden="true" />,
				}}
			/>,
		);
		const ghostHeader = ghost.container.querySelector(
			'[data-slot="section-card-header"]',
		);
		expect(ghostHeader?.className).toContain('min-h-10');
	});

	test('the description slot is the same element with and without data', () => {
		const ready = render(
			<ChartCard
				{...baseProps}
				testId="card-desc-ready"
				series={{ status: 'ready', chart: <span />, table: <span /> }}
			/>,
		);
		const readyNote = ready.container.querySelector('p.pt-3');
		expect(readyNote?.textContent).toBe('The real description');
		cleanup();

		const ghost = render(
			<ChartCard
				{...baseProps}
				testId="card-desc-ghost"
				series={{
					status: 'unavailable',
					sentence: 'The curve will be drawn here.',
					ghost: <svg aria-hidden="true" />,
				}}
			/>,
		);
		const ghostNote = ghost.container.querySelector('p.pt-3');
		expect(ghostNote?.textContent).toBe('The curve will be drawn here.');
		// Same slot, same size: only the colour mix differs (the AA-safe
		// `.ghost-sentence`).
		expect(ghostNote?.className).toBe(readyNote?.className);
	});
});
