/**
 * @vitest-environment jsdom
 */
import { act, cleanup, render, screen } from '@testing-library/react';
import type { ComponentType, ReactNode } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { TenantPublicationRow } from '~/lib/query/tenant-publications';
import type { TestLabelMap } from '~/lib/testing/test-label-map';

const mocks = vi.hoisted(() => ({
	rows: [] as TenantPublicationRow[],
	nextCursor: null as string | null,
	queryError: null as Error | null,
	shouldLogout: false,
	// Client time of the last successful fetch; 0 = no data yet (the poll
	// window stays off until a fetch lands).
	dataUpdatedAt: 0,
	invalidateTenantPublications: vi.fn(),
}));

vi.mock('~/lib/query/tenant-publications', () => ({
	useTenantPublicationsQuery: () => ({
		data: { payload: 'publications' },
		isPending: false,
		isError: false,
		error: mocks.queryError,
		refetch: vi.fn(),
		isFetching: false,
		dataUpdatedAt: mocks.dataUpdatedAt,
	}),
	toTenantPublicationRows: () => mocks.rows,
	isTenantPublicationStatus: (value: string) =>
		['scheduled', 'in_progress', 'published', 'failed', 'paused'].includes(
			value,
		),
	invalidateTenantPublications: mocks.invalidateTenantPublications,
}));

vi.mock('@tanstack/react-query', () => ({
	useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

vi.mock('@tanstack/react-router', () => ({
	createFileRoute: () => (options: Record<string, unknown>) => ({
		...options,
		options,
		useNavigate: () => () => undefined,
		useSearch: () => ({}),
	}),
	Link: ({ children, to, ...props }: { children: ReactNode; to: string }) => (
		<a href={to} {...props}>
			{children}
		</a>
	),
}));

vi.mock('~/lib/query/tenants-for-picker', () => ({
	useResolvedWorkspaceTenantId: () => '11111111-1111-1111-1111-111111111111',
}));

vi.mock('@org/shared-ts/lib/should-logout-for-failure', () => ({
	shouldLogoutForFailure: () => mocks.shouldLogout,
}));

vi.mock('~/components/error-views/LogoutRedirect', () => ({
	LogoutRedirect: () => <div data-testid="logout-redirect" />,
}));

const EN_LABELS: TestLabelMap = {
	history: 'History',
	'posts:history': 'History',
	'posts:history-description': 'Publications across your connected accounts.',
	'posts:history-account-label': 'Account',
	'posts:history-post-label': 'Post',
	'posts:history-status-label': 'Status',
	'posts:view-on-bluesky': 'View on Bluesky',
	'posts:publish-retry': 'Retry',
	'posts:publish-retry-stub-title':
		'Retrying a failed publication arrives with scheduling (D4).',
	'posts:publish-status-in-progress': 'In progress…',
	'posts:publish-status-published': 'Published',
	'posts:publish-status-paused': 'Paused',
	'posts:publish-status-scheduled': 'Scheduled',
	'posts:publish-status-failed': 'Failed',
	'posts:publication-failed-cause': 'Failed: {{cause}}',
	'posts:publication-paused-cause': 'Paused: {{cause}}',
	'posts:publication-paused-next-action':
		'Reconnect the account in Settings under Integrations to resume.',
	'posts:publication-paused-next-action-aria':
		'Reconnect paused account to resume',
	'posts:publication-paused-next-action-link':
		'Reconnect account in Settings under Integrations',
	'common:updated-at': 'Updated at',
};

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string, options?: { cause?: string }) => {
			const value =
				EN_LABELS[key] ?? EN_LABELS[key.replace(/^posts:/, '')] ?? key;
			return options?.cause ? value.replace('{{cause}}', options.cause) : value;
		},
		i18n: { resolvedLanguage: 'en', language: 'en' },
	}),
}));

// eslint-disable-next-line import/first -- must follow the vi.mock calls above
import { Route } from './history';

const TenantPostsHistoryPage = Route.options.component as ComponentType;

const row = (overrides: Record<string, unknown>): TenantPublicationRow => ({
	id: 'pub-1',
	postId: 'post-1',
	socialAccountId: 'acc-1',
	accountLabel: '@team.publyapp.dev',
	postExcerpt: 'Hello world',
	status: 'published',
	externalUrl: 'https://bsky.app/profile/team.publyapp.dev/post/1',
	lastError: null,
	updatedAt: new Date('2026-08-25T10:00:00Z'),
	...overrides,
});

afterEach(() => {
	cleanup();
	vi.useRealTimers();
	vi.clearAllMocks();
	mocks.rows = [];
	mocks.nextCursor = null;
	mocks.queryError = null;
	mocks.shouldLogout = false;
	mocks.dataUpdatedAt = 0;
});

describe('TenantPostsHistoryPage', () => {
	test('keeps the page anchor and drops the read-only badge', () => {
		render(<TenantPostsHistoryPage />);

		expect(screen.getByTestId('tenant-posts-history-page')).toBeTruthy();
		expect(screen.queryByTestId('account-read-only-badge')).toBeNull();
	});

	test('published row links to the external post in a new tab', () => {
		mocks.rows = [row({})];
		render(<TenantPostsHistoryPage />);

		const link = screen.getByTestId('tenant-posts-history-link');
		expect(link.getAttribute('href')).toBe(
			'https://bsky.app/profile/team.publyapp.dev/post/1',
		);
		expect(link.getAttribute('target')).toBe('_blank');
		expect(link.getAttribute('rel')).toContain('noopener');
	});

	test('failed row shows its status pill, plain-word cause, and disabled Retry stub', () => {
		mocks.rows = [
			row({
				id: 'pub-2',
				status: 'failed',
				externalUrl: null,
				lastError: 'Bluesky refused the credentials',
			}),
		];
		render(<TenantPostsHistoryPage />);

		expect(
			screen.getByTestId('tenant-posts-publication-cause').textContent,
		).toBe('Failed: Bluesky refused the credentials');
		const retry = screen.getByRole('button', { name: 'Retry' });
		expect(retry.hasAttribute('disabled')).toBe(true);
		expect(retry.getAttribute('title')).toBe(
			'Retrying a failed publication arrives with scheduling (D4).',
		);
	});

	test('in-progress row shows the in-progress pill', () => {
		mocks.rows = [
			row({
				id: 'pub-3',
				status: 'in_progress',
				externalUrl: null,
			}),
		];
		render(<TenantPostsHistoryPage />);

		const pill = screen.getByTestId('tenant-posts-history-status-pill');
		expect(pill.getAttribute('data-tone')).toBe('info');
		expect(pill.textContent).toBe('In progress…');
	});

	test('scheduled row shows the shared publication status pill (Scheduled, neutral tone)', () => {
		mocks.rows = [
			row({
				id: 'pub-scheduled',
				status: 'scheduled',
				externalUrl: null,
			}),
		];
		render(<TenantPostsHistoryPage />);

		const pill = screen.getByTestId('tenant-posts-history-status-pill');
		expect(pill.getAttribute('data-tone')).toBe('neutral');
		expect(pill.textContent).toBe('Scheduled');
	});

	test('paused row shows the shared publication status pill (Paused, warning tone)', () => {
		mocks.rows = [
			row({
				id: 'pub-paused',
				status: 'paused',
				externalUrl: null,
			}),
		];
		render(<TenantPostsHistoryPage />);

		const pill = screen.getByTestId('tenant-posts-history-status-pill');
		expect(pill.getAttribute('data-tone')).toBe('warning');
		expect(pill.textContent).toBe('Paused');
	});

	test('paused row renders its transparent failure cause and a reconnect next action', () => {
		mocks.rows = [
			row({
				id: 'pub-paused-cause',
				status: 'paused',
				externalUrl: null,
				lastError: 'account disconnected',
			}),
		];
		render(<TenantPostsHistoryPage />);

		const cause = screen.getByTestId('tenant-posts-publication-cause');
		expect(cause.textContent).toContain('Paused: account disconnected');
		expect(cause.getAttribute('title')).toBe(
			'Reconnect the account in Settings under Integrations to resume.',
		);
		const recoveryLink = screen.getByRole('link', {
			name: 'Reconnect paused account to resume',
		});
		expect(recoveryLink.getAttribute('href')).toBe(
			'/tenant/settings/integrations',
		);
	});

	test('published row keeps the external link AND renders the shared Published pill (success tone)', () => {
		mocks.rows = [row({})];
		render(<TenantPostsHistoryPage />);

		// External link is preserved (#647): the operator still navigates to
		// the live post from the history row.
		const link = screen.getByTestId('tenant-posts-history-link');
		expect(link.getAttribute('href')).toBe(
			'https://bsky.app/profile/team.publyapp.dev/post/1',
		);
		expect(link.getAttribute('target')).toBe('_blank');

		// Every recognized status also carries a pill (queue/calendar parity).
		const pill = screen.getByTestId('tenant-posts-history-status-pill');
		expect(pill.getAttribute('data-tone')).toBe('success');
		expect(pill.textContent).toBe('Published');
	});

	test('invalidates the publications query every ~5s while any row is in progress, then stops', () => {
		vi.useFakeTimers();
		mocks.rows = [
			row({ id: 'pub-4', status: 'in_progress', externalUrl: null }),
		];
		render(<TenantPostsHistoryPage />);

		act(() => {
			vi.advanceTimersByTime(11_000);
		});
		expect(
			mocks.invalidateTenantPublications.mock.calls.length,
		).toBeGreaterThanOrEqual(2);

		cleanup();
		mocks.invalidateTenantPublications.mockClear();
		mocks.rows = [row({ id: 'pub-4', status: 'published' })];
		render(<TenantPostsHistoryPage />);

		act(() => {
			vi.advanceTimersByTime(11_000);
		});
		expect(mocks.invalidateTenantPublications).not.toHaveBeenCalled();
	});

	// Publish-now race (#1655 e2e): a publish-now row is `scheduled` until the
	// worker claims its delivery job (LISTEN/NOTIFY, or the 5s queue poll). If
	// the history list's first fetch lands in that window it sees `scheduled`,
	// and a gate that only watches `in_progress` never starts polling — the
	// worker publishes seconds later but the list never re-validates. Freshness
	// is measured against the query's dataUpdatedAt (pure, data-derived), so
	// the tests pin that value and position the row's updatedAt relative to it.
	const DATA_UPDATED_AT = 1_000_000;

	test('polls while a freshly-scheduled row is in flight', () => {
		vi.useFakeTimers();
		mocks.dataUpdatedAt = DATA_UPDATED_AT;
		mocks.rows = [
			row({
				id: 'pub-5',
				status: 'scheduled',
				externalUrl: null,
				updatedAt: new Date(DATA_UPDATED_AT - 5_000),
			}),
		];
		render(<TenantPostsHistoryPage />);

		act(() => {
			vi.advanceTimersByTime(11_000);
		});
		expect(
			mocks.invalidateTenantPublications.mock.calls.length,
		).toBeGreaterThanOrEqual(2);
	});

	test('does not poll for a scheduled row older than the in-flight window', () => {
		vi.useFakeTimers();
		mocks.dataUpdatedAt = DATA_UPDATED_AT;
		mocks.rows = [
			row({
				id: 'pub-6',
				status: 'scheduled',
				externalUrl: null,
				updatedAt: new Date(DATA_UPDATED_AT - 2 * 60_000),
			}),
		];
		render(<TenantPostsHistoryPage />);

		act(() => {
			vi.advanceTimersByTime(11_000);
		});
		expect(mocks.invalidateTenantPublications).not.toHaveBeenCalled();
	});

	test('unknown wire status renders the neutral em-dash (raw value is never shown)', () => {
		mocks.rows = [
			row({
				id: 'pub-unknown',
				status: 'revoked',
				externalUrl: null,
			}),
		];
		render(<TenantPostsHistoryPage />);

		expect(screen.getAllByText('\u2014').length).toBeGreaterThan(0);
		expect(screen.queryByText(/revoked/)).toBeNull();
	});

	test('fatal error logs out only through shouldLogoutForFailure (401-only rule)', () => {
		mocks.queryError = new Error('401 unauthorized');
		mocks.shouldLogout = true;
		render(<TenantPostsHistoryPage />);

		expect(screen.getByTestId('logout-redirect')).toBeTruthy();
	});
});
