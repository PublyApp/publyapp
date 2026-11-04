import { IconCalendarEvent } from '@tabler/icons-react';
/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string, options?: Record<string, unknown>) => {
			if (key === 'history-events') {
				return `history-events:${String(options?.count)}`;
			}
			let text = key;
			for (const [name, value] of Object.entries(options ?? {})) {
				text = text.replaceAll(`{{${name}}}`, String(value));
			}
			return text;
		},
		i18n: { exists: () => true, language: 'fr' },
	}),
}));

import { HistoryPage } from './history-page';
import type { HistoryEvent } from './history-types';

afterEach(() => {
	cleanup();
	document.getElementById('app-shell-page-panel')?.remove();
});

const NOW = new Date();
const YESTERDAY = new Date(NOW.valueOf() - 86_400_000);

const event = (overrides: Partial<HistoryEvent>): HistoryEvent => ({
	id: 'log-1',
	at: NOW,
	actorName: 'Ada Admin',
	action: 'tenant.suspended',
	ipAddress: '10.0.0.1',
	targetId: '0197b8f0-3333-7ccc-8ccc-cccccccccccc',
	...overrides,
});

const renderPage = (
	overrides: Partial<Parameters<typeof HistoryPage>[0]> = {},
) =>
	render(
		<HistoryPage
			testId="history-test"
			title="history-title"
			events={[event({})]}
			locale="fr"
			onOpen={() => {}}
			openLabel={(row) => `open ${row.id}`}
			emptyTitle="empty-title"
			emptyText="empty-text"
			queryState={{ isPending: false, isError: false, onRetry: () => {} }}
			{...overrides}
		/>,
	);

describe('HistoryPage', () => {
	test('renders the title row, the day heading and one line per event', () => {
		renderPage();

		expect(screen.getByText('history-title')).toBeTruthy();
		expect(screen.getByText('history-day-today')).toBeTruthy();
		expect(screen.getByText('Ada Admin')).toBeTruthy();
		expect(screen.getByText('history-action-tenant-suspended')).toBeTruthy();
		expect(screen.getByText('history-category-tenant')).toBeTruthy();
		expect(screen.getByText('history-sensitive')).toBeTruthy();
		// The prototype's activity lines carry no raw target id.
		expect(screen.queryByText(/0197b8f0/)).toBeNull();
	});

	test('groups events by local day and counts each day', () => {
		renderPage({
			events: [
				event({ id: 'a' }),
				event({ id: 'b', actorName: 'Grace' }),
				event({ id: 'c', at: YESTERDAY, actorName: 'Linus' }),
			],
		});

		expect(screen.getByText('history-day-today')).toBeTruthy();
		expect(screen.getByText('history-day-yesterday')).toBeTruthy();
		expect(screen.getAllByText('2')).toHaveLength(1);
		expect(screen.getAllByText('1')).toHaveLength(1);
	});

	test('opens the event through the row action', () => {
		const onOpen = vi.fn();
		renderPage({ onOpen, openLabel: () => 'open event' });

		fireEvent.click(screen.getByRole('button', { name: 'open event' }));
		expect(onOpen).toHaveBeenCalledTimes(1);
		expect(onOpen.mock.calls[0]?.[0]).toMatchObject({ id: 'log-1' });
	});

	test('shows the loading skeleton for the pending state', () => {
		renderPage({
			queryState: { isPending: true, isError: false, onRetry: () => {} },
		});

		expect(screen.getByTestId('history-test-loading')).toBeTruthy();
	});

	test('shows the error surface and retries', () => {
		const onRetry = vi.fn();
		renderPage({
			events: [],
			queryState: { isPending: false, isError: true, onRetry },
		});

		expect(screen.getByTestId('history-test-error')).toBeTruthy();
		fireEvent.click(screen.getByRole('button', { name: /retry/i }));
		expect(onRetry).toHaveBeenCalledTimes(1);
	});

	test('shows the empty state without filters and the no-match state with one', () => {
		const { unmount } = renderPage({ events: [] });
		expect(screen.getByTestId('history-test-empty')).toBeTruthy();
		unmount();

		renderPage({
			events: [],
			filters: [
				{
					key: 'period',
					label: 'history-filter-period',
					icon: IconCalendarEvent,
					choices: [{ value: 'today', label: 'history-period-today' }],
				},
			],
			filtersValue: { period: ['today'] },
			onFiltersChange: () => {},
		});
		expect(screen.getByTestId('history-test-no-match')).toBeTruthy();
	});

	test('prints « — » instead of a page-local total, and the exact count when known', () => {
		const { unmount } = renderPage();
		expect(screen.getByTestId('history-test-count').textContent).toContain(
			'history-events-unknown',
		);
		unmount();

		renderPage({ totalCount: 42 });
		expect(screen.getByTestId('history-test-count').textContent).toContain(
			'history-events:42',
		);
	});

	test('renders the figures and the export action from the caller', () => {
		const onExport = vi.fn();
		renderPage({
			cards: <div>a figure</div>,
			onExport,
			exportTestId: 'history-test-export',
		});

		expect(screen.getByText('a figure')).toBeTruthy();
		fireEvent.click(screen.getByTestId('history-test-export'));
		expect(onExport).toHaveBeenCalledTimes(1);
	});
});
