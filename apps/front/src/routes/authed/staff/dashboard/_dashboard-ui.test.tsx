/**
 * @vitest-environment jsdom
 */
import type { UseQueryResult } from '@tanstack/react-query';
import {
	cleanup,
	fireEvent,
	render,
	screen,
	within,
} from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { TestLabelMap } from '~/lib/testing/test-label-map';

const EN_LABELS: TestLabelMap = {
	'dashboard-ghost-tag': 'No data yet',
	'dashboard-view-chart': 'Chart',
	'dashboard-view-table': 'Table',
	'dashboard-view-toggle': 'Display',
	'query-display-error-default': 'Could not load the data',
	'common:retry': 'Retry',
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
import sharedEn from '@org/shared-ts/lib/i18n/locales/en';
// eslint-disable-next-line import/first -- must follow the vi.mock calls above
import sharedFr from '@org/shared-ts/lib/i18n/locales/fr';

// eslint-disable-next-line import/first -- must follow the vi.mock calls above
import { periodStart } from './_dashboard-filters';
// eslint-disable-next-line import/first -- must follow the vi.mock calls above
import { ChartCard, KpiCard } from './_dashboard-ui';

afterEach(cleanup);

const baseProps = {
	testId: 'staff-dashboard-card',
	label: 'Card',
	icon: null,
	note: 'The real description',
};

/** The flags `QueryDisplay` reads for the card ladder (default strategy
 * `pending`), shaped like a real `UseQueryResult`. */
const queryOf = (overrides: {
	isPending?: boolean;
	isError?: boolean;
	error?: unknown;
	refetch?: () => void;
}): UseQueryResult<unknown, Error> =>
	({
		data: undefined,
		error: overrides.error ?? null,
		isPending: overrides.isPending ?? false,
		isError: overrides.isError ?? false,
		refetch: overrides.refetch ?? (() => undefined),
	}) as UseQueryResult<unknown, Error>;

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
				query={queryOf({
					isError: true,
					error: new Error('boom'),
					refetch: vi.fn(),
				})}
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
				query={queryOf({ isPending: true })}
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
		const readyNote = ready.container.querySelector('.pt-3\\.5');
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
		const ghostNote = ghost.container.querySelector('.pt-3\\.5');
		expect(ghostNote?.textContent).toBe('The curve will be drawn here.');
		// Same slot, same size: only the colour mix differs (the AA-safe
		// `.ghost-sentence`).
		expect(ghostNote?.className).toBe(readyNote?.className);
	});
});

describe('KpiCard error', () => {
	test('a failed KPI is a compact error, not the page-scale error surface', () => {
		const refetch = vi.fn();
		render(
			<KpiCard
				testId="staff-dashboard-kpi-audit-events"
				label="Audit events"
				icon={null}
				figure={undefined}
				locale="en"
				query={queryOf({ isError: true, error: new Error('500'), refetch })}
			/>,
		);

		const card = screen.getByTestId('staff-dashboard-kpi-audit-events');
		expect(
			within(card).getByTestId('staff-dashboard-kpi-audit-events-error'),
		).toBeTruthy();
		// The value area keeps the card's own figure slot, as « — ».
		expect(within(card).getByText('—')).toBeTruthy();
		// One small line and a small retry, no page pictogram/title/44px button.
		expect(within(card).getByText('Could not load the data')).toBeTruthy();
		expect(card.querySelector('.publy-state-icon-cluster')).toBeNull();
		expect(card.querySelector('h1, h2, h3')).toBeNull();
		const retry = within(card).getByRole('button', { name: 'Retry' });
		expect(retry.className).toContain('h-7');
		fireEvent.click(retry);
		expect(refetch).toHaveBeenCalledTimes(1);
	});

	test('the compact error shows the whole message, never truncated (#2339 fix6)', () => {
		render(
			<KpiCard
				testId="staff-dashboard-kpi-audit-events"
				label="Audit events"
				icon={null}
				figure={undefined}
				locale="en"
				query={queryOf({ isError: true, error: new Error('500') })}
			/>,
		);

		const card = screen.getByTestId('staff-dashboard-kpi-audit-events');
		const alert = within(card).getByTestId(
			'staff-dashboard-kpi-audit-events-error',
		);
		// The full cause reads in the DOM…
		expect(within(alert).getByText('Could not load the data')).toBeTruthy();
		// …with no truncation class (`truncate`, `line-clamp-1`,
		// `text-ellipsis`) anywhere between the alert and the message.
		const message = within(alert).getByText('Could not load the data');
		for (
			let node: HTMLElement | null = message;
			node && node !== alert;
			node = node.parentElement
		) {
			expect(node.className).not.toMatch(/truncate|line-clamp|text-ellipsis/);
		}
		expect(alert.className).not.toMatch(/truncate|line-clamp|text-ellipsis/);
		// The retry stays.
		expect(within(card).getByRole('button', { name: 'Retry' })).toBeTruthy();
	});
});

describe('periodStart', () => {
	test('12m is 12 calendar months, not 365 days (N11)', () => {
		// 2024 is a leap year: 12 calendar months before 2024-03-01 is
		// 2023-03-01, while 365 days earlier would be 2023-03-02.
		expect(periodStart('12m', new Date(2024, 2, 1, 12))).toBe('2023-03-01');
	});

	test('the start is the local calendar day, never a UTC-shifted one (N11)', () => {
		// 00:30 local is still the previous day in UTC east of Greenwich; the
		// wire date must stay on the local day the user picked.
		expect(periodStart('7d', new Date(2026, 0, 15, 0, 30))).toBe('2026-01-09');
	});

	test('the day presets count calendar days, today included', () => {
		// Jan 31 − 29 days = Jan 2: exactly 30 days, not 31 (B MA-1).
		expect(periodStart('30d', new Date(2026, 0, 31, 9))).toBe('2026-01-02');
	});
});

describe('dashboard i18n', () => {
	test('the expiry sentences carry both plural forms (N6)', () => {
		for (const bundle of [sharedEn.common, sharedFr.common]) {
			for (const key of [
				'dashboard-expires-in-days',
				'dashboard-expires-in-hours',
			]) {
				const values = bundle as Record<string, string | undefined>;
				expect(values[`${key}_one`]).toBeTruthy();
				expect(values[`${key}_other`]).toBeTruthy();
				expect(values[key]).toBeUndefined();
			}
		}
	});
});
