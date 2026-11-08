import { IconCalendarEvent } from '@tabler/icons-react';
/**
 * @vitest-environment jsdom
 */
import {
	cleanup,
	fireEvent,
	render,
	screen,
	within,
} from '@testing-library/react';
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

import type { QueryDisplayQuery } from '~/components/query-display';

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

/** The `query` prop: the page only reads its state flags, `error` and `refetch`. */
const fakeQuery = (
	overrides: Partial<QueryDisplayQuery> = {},
): QueryDisplayQuery => ({
	isPending: false,
	isLoading: false,
	isFetching: false,
	isError: false,
	error: null,
	data: undefined,
	refetch: vi.fn(),
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
			query={fakeQuery()}
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
			query: fakeQuery({ isPending: true }),
		});

		expect(screen.getByTestId('history-test-loading')).toBeTruthy();
	});

	test('shows the error surface and retries', () => {
		const onRetry = vi.fn();
		renderPage({
			events: [],
			query: fakeQuery({ isError: true, refetch: onRetry }),
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

// #2341: the states are rendered through `QueryDisplay` now; these snapshots
// were taken from the hand-written ladder and must stay identical. The data
// state is asserted structurally: the loaded row carries a real PersonAvatar
// whose circular radii the design-system source scanner forbids in source.
describe('HistoryPage state DOM', () => {
	test('pending', () => {
		renderPage({
			query: fakeQuery({ isPending: true }),
		});

		expect(screen.getByTestId('history-test-loading')).toMatchInlineSnapshot(`
			<div
			  aria-hidden="true"
			  class="flex flex-col gap-5"
			  data-testid="history-test-loading"
			>
			  <div
			    class="flex flex-col gap-2"
			  >
			    <div
			      class="animate-pulse rounded-[var(--publy-radius-control)] bg-muted ml-1 h-4 w-24"
			      data-slot="skeleton"
			    />
			    <div
			      class="overflow-clip rounded-[var(--publy-radius-control)] border bg-background"
			    >
			      <div
			        class="flex min-h-12 items-center gap-3 border-b px-3 py-2 last:border-b-0"
			      >
			        <div
			          class="animate-pulse bg-muted size-8 shrink-0 rounded-[10px]"
			          data-slot="skeleton"
			        />
			        <div
			          class="animate-pulse rounded-[var(--publy-radius-control)] bg-muted h-3 w-64"
			          data-slot="skeleton"
			        />
			        <div
			          class="animate-pulse bg-muted ml-auto h-5 w-20 rounded-[10px]"
			          data-slot="skeleton"
			        />
			        <div
			          class="animate-pulse rounded-[var(--publy-radius-control)] bg-muted h-3 w-24"
			          data-slot="skeleton"
			        />
			        <div
			          class="animate-pulse rounded-[var(--publy-radius-control)] bg-muted h-3 w-10"
			          data-slot="skeleton"
			        />
			      </div>
			      <div
			        class="flex min-h-12 items-center gap-3 border-b px-3 py-2 last:border-b-0"
			      >
			        <div
			          class="animate-pulse bg-muted size-8 shrink-0 rounded-[10px]"
			          data-slot="skeleton"
			        />
			        <div
			          class="animate-pulse rounded-[var(--publy-radius-control)] bg-muted h-3 w-64"
			          data-slot="skeleton"
			        />
			        <div
			          class="animate-pulse bg-muted ml-auto h-5 w-20 rounded-[10px]"
			          data-slot="skeleton"
			        />
			        <div
			          class="animate-pulse rounded-[var(--publy-radius-control)] bg-muted h-3 w-24"
			          data-slot="skeleton"
			        />
			        <div
			          class="animate-pulse rounded-[var(--publy-radius-control)] bg-muted h-3 w-10"
			          data-slot="skeleton"
			        />
			      </div>
			      <div
			        class="flex min-h-12 items-center gap-3 border-b px-3 py-2 last:border-b-0"
			      >
			        <div
			          class="animate-pulse bg-muted size-8 shrink-0 rounded-[10px]"
			          data-slot="skeleton"
			        />
			        <div
			          class="animate-pulse rounded-[var(--publy-radius-control)] bg-muted h-3 w-64"
			          data-slot="skeleton"
			        />
			        <div
			          class="animate-pulse bg-muted ml-auto h-5 w-20 rounded-[10px]"
			          data-slot="skeleton"
			        />
			        <div
			          class="animate-pulse rounded-[var(--publy-radius-control)] bg-muted h-3 w-24"
			          data-slot="skeleton"
			        />
			        <div
			          class="animate-pulse rounded-[var(--publy-radius-control)] bg-muted h-3 w-10"
			          data-slot="skeleton"
			        />
			      </div>
			      <div
			        class="flex min-h-12 items-center gap-3 border-b px-3 py-2 last:border-b-0"
			      >
			        <div
			          class="animate-pulse bg-muted size-8 shrink-0 rounded-[10px]"
			          data-slot="skeleton"
			        />
			        <div
			          class="animate-pulse rounded-[var(--publy-radius-control)] bg-muted h-3 w-64"
			          data-slot="skeleton"
			        />
			        <div
			          class="animate-pulse bg-muted ml-auto h-5 w-20 rounded-[10px]"
			          data-slot="skeleton"
			        />
			        <div
			          class="animate-pulse rounded-[var(--publy-radius-control)] bg-muted h-3 w-24"
			          data-slot="skeleton"
			        />
			        <div
			          class="animate-pulse rounded-[var(--publy-radius-control)] bg-muted h-3 w-10"
			          data-slot="skeleton"
			        />
			      </div>
			      <div
			        class="flex min-h-12 items-center gap-3 border-b px-3 py-2 last:border-b-0"
			      >
			        <div
			          class="animate-pulse bg-muted size-8 shrink-0 rounded-[10px]"
			          data-slot="skeleton"
			        />
			        <div
			          class="animate-pulse rounded-[var(--publy-radius-control)] bg-muted h-3 w-64"
			          data-slot="skeleton"
			        />
			        <div
			          class="animate-pulse bg-muted ml-auto h-5 w-20 rounded-[10px]"
			          data-slot="skeleton"
			        />
			        <div
			          class="animate-pulse rounded-[var(--publy-radius-control)] bg-muted h-3 w-24"
			          data-slot="skeleton"
			        />
			        <div
			          class="animate-pulse rounded-[var(--publy-radius-control)] bg-muted h-3 w-10"
			          data-slot="skeleton"
			        />
			      </div>
			      <div
			        class="flex min-h-12 items-center gap-3 border-b px-3 py-2 last:border-b-0"
			      >
			        <div
			          class="animate-pulse bg-muted size-8 shrink-0 rounded-[10px]"
			          data-slot="skeleton"
			        />
			        <div
			          class="animate-pulse rounded-[var(--publy-radius-control)] bg-muted h-3 w-64"
			          data-slot="skeleton"
			        />
			        <div
			          class="animate-pulse bg-muted ml-auto h-5 w-20 rounded-[10px]"
			          data-slot="skeleton"
			        />
			        <div
			          class="animate-pulse rounded-[var(--publy-radius-control)] bg-muted h-3 w-24"
			          data-slot="skeleton"
			        />
			        <div
			          class="animate-pulse rounded-[var(--publy-radius-control)] bg-muted h-3 w-10"
			          data-slot="skeleton"
			        />
			      </div>
			    </div>
			  </div>
			</div>
		`);
	});

	test('error', () => {
		renderPage({
			events: [],
			query: fakeQuery({ isError: true }),
		});

		expect(screen.getByTestId('history-test-error')).toMatchInlineSnapshot(`
			<div
			  aria-live="assertive"
			  class="publy-state-surface mx-auto w-full max-w-sm"
			  data-presentation="status"
			  data-testid="history-test-error"
			  data-tone="danger"
			  role="alert"
			>
			  <div
			    aria-hidden="true"
			    class="publy-state-icon-cluster"
			    data-presentation="status"
			    data-scale="inline"
			    data-tone="danger"
			  >
			    <svg
			      aria-hidden="true"
			      class="absolute inset-0 size-36"
			      viewBox="0 0 144 144"
			    >
			      <circle
			        class="publy-status-ring"
			        cx="72"
			        cy="72"
			        r="71.5"
			      />
			      <circle
			        class="publy-status-ring publy-status-ring--inner"
			        cx="72"
			        cy="72"
			        r="55.5"
			      />
			    </svg>
			    <div
			      class="publy-state-icon"
			      data-presentation="status"
			      data-tone="danger"
			    >
			      <svg
			        aria-hidden="true"
			        class="tabler-icon tabler-icon-alert-triangle"
			        fill="none"
			        height="24"
			        stroke="currentColor"
			        stroke-linecap="round"
			        stroke-linejoin="round"
			        stroke-width="2"
			        viewBox="0 0 24 24"
			        width="24"
			        xmlns="http://www.w3.org/2000/svg"
			      >
			        <path
			          d="M12 9v4"
			        />
			        <path
			          d="M10.363 3.591l-8.106 13.534a1.914 1.914 0 0 0 1.636 2.871h16.214a1.914 1.914 0 0 0 1.636 -2.87l-8.106 -13.536a1.914 1.914 0 0 0 -3.274 0"
			        />
			        <path
			          d="M12 16h.01"
			        />
			      </svg>
			    </div>
			  </div>
			  <div>
			    <div
			      class="font-semibold text-balance mt-4 text-xl focus:outline-none"
			    >
			      query-display-error-default
			    </div>
			    <p
			      class="mt-2 max-w-[380px] text-sm leading-normal text-pretty text-muted-foreground"
			    >
			      query-display-error-cause-unknown
			    </p>
			  </div>
			  <div
			    class="mt-6 flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:justify-center"
			  >
			    <button
			      class="group/button inline-flex shrink-0 cursor-pointer items-center justify-center border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 aria-invalid:focus-visible:border-ring aria-invalid:focus-visible:ring-ring dark:aria-invalid:focus-visible:ring-ring [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 btn-primary-chrome bg-primary text-primary-foreground hover:bg-primary/80 gap-1.5 rounded-[var(--publy-radius-control)] has-data-[icon=inline-end]:pr-2.5 has-data-[icon=inline-start]:pl-2.5 h-11 px-4"
			      data-slot="button"
			      tabindex="0"
			      type="button"
			    >
			      <svg
			        class="tabler-icon tabler-icon-refresh"
			        data-icon="inline-start"
			        fill="none"
			        height="24"
			        stroke="currentColor"
			        stroke-linecap="round"
			        stroke-linejoin="round"
			        stroke-width="2"
			        viewBox="0 0 24 24"
			        width="24"
			        xmlns="http://www.w3.org/2000/svg"
			      >
			        <path
			          d="M20 11a8.1 8.1 0 0 0 -15.5 -2m-.5 -4v4h4"
			        />
			        <path
			          d="M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4"
			        />
			      </svg>
			      common:retry
			    </button>
			  </div>
			</div>
		`);
	});

	test('empty', () => {
		renderPage({ events: [] });

		expect(screen.getByTestId('history-test-empty')).toMatchInlineSnapshot(`
			<div
			  class="publy-state-surface mx-auto w-full max-w-sm"
			  data-presentation="empty"
			  data-testid="history-test-empty"
			  data-tone="neutral"
			  role="status"
			>
			  <div
			    aria-hidden="true"
			    class="publy-state-icon-cluster"
			    data-presentation="empty"
			    data-scale="inline"
			    data-tone="neutral"
			  >
			    <svg
			      aria-hidden="true"
			      class="absolute inset-0 size-[120px]"
			      viewBox="0 0 120 120"
			    >
			      <circle
			        class="publy-empty-ring"
			        cx="60"
			        cy="60"
			        r="59.5"
			      />
			      <circle
			        class="publy-empty-ring publy-empty-ring--inner"
			        cx="60"
			        cy="60"
			        r="45.5"
			      />
			    </svg>
			    <div
			      class="publy-state-icon"
			      data-presentation="empty"
			      data-tone="neutral"
			    >
			      <svg
			        aria-hidden="true"
			        class="tabler-icon tabler-icon-inbox"
			        fill="none"
			        height="24"
			        stroke="currentColor"
			        stroke-linecap="round"
			        stroke-linejoin="round"
			        stroke-width="2"
			        viewBox="0 0 24 24"
			        width="24"
			        xmlns="http://www.w3.org/2000/svg"
			      >
			        <path
			          d="M4 6a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2l0 -12"
			        />
			        <path
			          d="M4 13h3l3 3h4l3 -3h3"
			        />
			      </svg>
			    </div>
			  </div>
			  <div>
			    <div
			      class="font-semibold text-balance mt-3 text-lg"
			    >
			      empty-title
			    </div>
			    <p
			      class="mt-2 max-w-[380px] text-sm leading-normal text-pretty text-muted-foreground"
			    >
			      empty-text
			    </p>
			  </div>
			</div>
		`);
	});

	test('data', () => {
		renderPage();
		const days = screen.getByTestId('history-test-days');
		const scope = within(days);

		// One day section holding one event row.
		expect(days.querySelectorAll('section')).toHaveLength(1);
		expect(scope.getByText('history-day-today')).toBeTruthy();
		expect(days.querySelectorAll('[data-history-event]')).toHaveLength(1);

		// The row mirrors the loaded composition: identity avatar, actor, action,
		// sensitive and category pills, IP and the open action.
		expect(days.querySelector('[data-slot="person-avatar"]')).toBeTruthy();
		expect(scope.getByText('AA')).toBeTruthy();
		expect(scope.getByText('Ada Admin')).toBeTruthy();
		expect(scope.getByText('history-action-tenant-suspended')).toBeTruthy();
		expect(scope.getByText('history-sensitive')).toBeTruthy();
		expect(scope.getByText('history-category-tenant')).toBeTruthy();
		expect(scope.getByText('10.0.0.1')).toBeTruthy();
		expect(scope.getByRole('button', { name: 'open log-1' })).toBeTruthy();
	});
});
