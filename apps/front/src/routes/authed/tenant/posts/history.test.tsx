/**
 * @vitest-environment jsdom
 */
import { act, cleanup, render, screen } from '@testing-library/react';
import type { ComponentType } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { TestLabelMap } from '~/lib/testing/test-label-map';

const mocks = vi.hoisted(() => ({
	rows: [] as Array<Record<string, string>>,
	nextCursor: null as string | null,
	queryError: null as Error | null,
	shouldLogout: false,
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
	}),
	toTenantPublicationRows: () => mocks.rows,
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
}));

vi.mock('~/lib/query/tenants-for-picker', () => ({
	useResolvedWorkspaceTenantId: () => '11111111-1111-1111-1111-111111111111',
}));

vi.mock('~/lib/should-logout-for-failure', () => ({
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
	'posts:publish-status-failed': 'Failed',
	'common:updated-at': 'Updated at',
};

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string) => EN_LABELS[key] ?? key,
		i18n: { resolvedLanguage: 'en', language: 'en' },
	}),
}));

// eslint-disable-next-line import/first -- must follow the vi.mock calls above
import { Route } from './history';

const TenantPostsHistoryPage = Route.options.component as ComponentType;

const row = (overrides: Record<string, unknown>) => ({
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

	test('failed row shows its plain-word cause and a disabled Retry stub explaining D4', () => {
		mocks.rows = [
			row({
				id: 'pub-2',
				status: 'failed',
				externalUrl: null,
				lastError: 'Bluesky refused the credentials',
			}),
		];
		render(<TenantPostsHistoryPage />);

		expect(screen.getByTestId('tenant-posts-history-cause').textContent).toBe(
			'Bluesky refused the credentials',
		);
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

		expect(screen.getByTestId('tenant-posts-publish-in-progress')).toBeTruthy();
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

	test('fatal error logs out only through shouldLogoutForFailure (401-only rule)', () => {
		mocks.queryError = new Error('401 unauthorized');
		mocks.shouldLogout = true;
		render(<TenantPostsHistoryPage />);

		expect(screen.getByTestId('logout-redirect')).toBeTruthy();
	});
});
