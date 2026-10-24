/**
 * @vitest-environment jsdom
 */
import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
	within,
} from '@testing-library/react';
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
	language: 'en',
	invalidateTenantPublications: vi.fn(),
	retry: vi.fn(),
	markPublished: vi.fn(),
	canPublish: true,
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
	useRetryPublicationMutation: () => ({
		mutate: mocks.retry,
		isPending: false,
	}),
	useMarkPublicationPublishedMutation: () => ({
		mutate: mocks.markPublished,
		isPending: false,
	}),
}));

vi.mock('~/lib/query/tenant-permissions', () => ({
	POSTS_PUBLISH: 'tenant.posts.publish',
	SOCIAL_ACCOUNTS_PUBLISH: 'tenant.socialaccounts.publish',
	useTenantPermissions: () => ({
		permissions: [],
		hasPermission: () => mocks.canPublish,
	}),
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
	Link: ({
		children,
		to,
		params,
		...props
	}: {
		children: ReactNode;
		to: string;
		params?: { postId: string };
	}) => (
		<a href={to.replace('$postId', params?.postId ?? '')} {...props}>
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
	'posts:publication-category-reconnect': 'Reconnect',
	'posts:publication-category-fix-content': 'Fix content',
	'posts:publication-category-retry-later': 'Retry later',
	'posts:publication-category-unknown': 'Unknown',
	'posts:publication-category-needs-review': 'Needs review',
	'posts:publication-action-mark-published': 'Mark as published',
	'posts:publication-review-open-profile': 'Check your profile',
	'posts:publication-review-mark-title': 'Mark as published?',
	'posts:publication-review-mark-description': 'Only confirm if you see it.',
	'posts:publication-review-retry-title': 'Send it again?',
	'posts:publication-review-retry-description':
		'Sending again will post it twice.',
	'posts:publication-review-retry-confirm': 'Send again',
	'posts:publication-category-message-reconnect': 'Account needs reconnecting.',
	'posts:publication-category-message-fix-content': 'Provider refused content.',
	'posts:publication-category-message-retry-later': 'Provider kept failing.',
	'posts:publication-category-message-unknown': 'Outcome unclassified.',
	'posts:publication-action-reconnect': 'Reconnect account',
	'posts:publication-action-edit': 'Edit post',
	'posts:publication-attempts': 'attempts',
	'posts:publication-retry-disabled-reconnect': 'Reconnect the account first.',
	'posts:publication-retry-disabled-permission': 'Need publish permission.',
	'posts:publication-retry-disabled-status': 'Only failed or paused.',
	'posts:publication-retry-disabled-superseded': 'Only the newest publication.',
	'posts:publication-superseded': 'Replaced',
	'posts:publication-superseded-description':
		'A newer publication replaced this one.',
	'posts:publication-customized': 'Customized',
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
	'posts:history-segments-progress': 'Thread progress',
	'posts:history-segments-total': 'Whole thread',
	'common:updated-at': 'Updated at',
};

const translate = (
	key: string,
	options?: { cause?: string; count?: number },
) => {
	const value = EN_LABELS[key] ?? EN_LABELS[key.replace(/^posts:/, '')] ?? key;
	if (options?.count !== undefined) {
		return `${options.count} ${value}`;
	}
	return options?.cause ? value.replace('{{cause}}', options.cause) : value;
};

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: translate,
		i18n: { resolvedLanguage: mocks.language, language: mocks.language },
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
	failureCategory: null,
	attempts: 0,
	accountUsable: true,
	superseded: false,
	customized: false,
	updatedAt: new Date('2026-08-25T10:00:00Z'),
	segmentsPublished: 0,
	segmentsTotal: 1,
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
	mocks.language = 'en';
	mocks.canPublish = true;
});

describe('TenantPostsHistoryPage', () => {
	test('keeps the page anchor and drops the read-only badge', () => {
		render(<TenantPostsHistoryPage />);

		expect(screen.getByTestId('tenant-posts-history-page')).toBeTruthy();
		expect(screen.queryByTestId('account-read-only-badge')).toBeNull();
	});

	test('renders history timestamps with French weekday and month names', () => {
		mocks.language = 'fr';
		const originalTz = process.env.TZ;
		process.env.TZ = 'Europe/Paris';
		try {
			mocks.rows = [row({})];
			render(<TenantPostsHistoryPage />);

			expect(screen.getByText('mar. 25 août 2026, 12:00')).toBeTruthy();
		} finally {
			if (originalTz === undefined) {
				delete process.env.TZ;
			} else {
				process.env.TZ = originalTz;
			}
		}
	});

	test('renders history timestamps with English weekday and month names', () => {
		const originalTz = process.env.TZ;
		process.env.TZ = 'Europe/Paris';
		try {
			mocks.rows = [row({})];
			render(<TenantPostsHistoryPage />);

			expect(screen.getByText('Tue, Aug 25, 2026, 12:00 PM')).toBeTruthy();
		} finally {
			if (originalTz === undefined) {
				delete process.env.TZ;
			} else {
				process.env.TZ = originalTz;
			}
		}
	});

	test('updates an already-mounted history timestamp when the language changes', () => {
		const originalTz = process.env.TZ;
		process.env.TZ = 'Europe/Paris';
		try {
			mocks.rows = [row({})];
			const { rerender } = render(<TenantPostsHistoryPage />);

			expect(screen.getByText('Tue, Aug 25, 2026, 12:00 PM')).toBeTruthy();

			mocks.language = 'fr';
			rerender(<TenantPostsHistoryPage />);

			expect(screen.queryByText('Tue, Aug 25, 2026, 12:00 PM')).toBeNull();
			expect(screen.getByText('mar. 25 août 2026, 12:00')).toBeTruthy();
		} finally {
			if (originalTz === undefined) {
				delete process.env.TZ;
			} else {
				process.env.TZ = originalTz;
			}
		}
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

	test('failed row shows its category pill, plain-word cause, attempts and an enabled Retry', () => {
		mocks.rows = [
			row({
				id: 'pub-2',
				status: 'failed',
				externalUrl: null,
				failureCategory: 'retry_later',
				attempts: 3,
				lastError: 'Bluesky refused the credentials',
			}),
		];
		render(<TenantPostsHistoryPage />);

		expect(
			screen.getByTestId('tenant-posts-publication-cause').textContent,
		).toBe('Failed: Bluesky refused the credentials');
		expect(
			screen.getByTestId('tenant-posts-history-category-pill').textContent,
		).toBe('Retry later');
		expect(
			screen.getByTestId('tenant-posts-publication-attempts').textContent,
		).toBe('3 attempts');
		const retry = screen.getByRole('button', { name: 'Retry' });
		expect(retry.hasAttribute('disabled')).toBe(false);
		expect(
			screen.queryByTestId('tenant-posts-publication-primary-action'),
		).toBeNull();
	});

	test('a needs-review row offers Mark as published and Retry, and marking fires its mutation', () => {
		mocks.rows = [
			row({
				id: 'pub-7',
				status: 'paused',
				externalUrl: null,
				failureCategory: 'needs_review',
				lastError: 'Check your profile',
			}),
		];
		render(<TenantPostsHistoryPage />);

		expect(
			screen.getByTestId('tenant-posts-history-category-pill').textContent,
		).toBe('Needs review');
		expect(
			screen.getByRole('button', { name: 'Retry' }).hasAttribute('disabled'),
		).toBe(false);

		fireEvent.click(screen.getByRole('button', { name: 'Mark as published' }));
		expect(mocks.markPublished).not.toHaveBeenCalled();
		fireEvent.click(
			within(screen.getByRole('alertdialog')).getByRole('button', {
				name: 'Mark as published',
			}),
		);

		expect(mocks.markPublished).toHaveBeenCalledWith({
			tenantId: '11111111-1111-1111-1111-111111111111',
			publicationId: 'pub-7',
		});
	});

	test('Retry on a needs-review row asks first, warns about a duplicate and links the profile', () => {
		mocks.rows = [
			row({
				id: 'pub-8',
				status: 'paused',
				externalUrl: null,
				failureCategory: 'needs_review',
				accountLabel: 'me@social.example',
			}),
		];
		render(<TenantPostsHistoryPage />);

		expect(
			screen
				.getByTestId('tenant-posts-publication-profile-link')
				.getAttribute('href'),
		).toBe('https://social.example/@me');
		fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
		expect(mocks.retry).not.toHaveBeenCalled();
		const dialog = screen.getByRole('alertdialog');
		expect(dialog.textContent).toContain('post it twice');
		fireEvent.click(within(dialog).getByRole('button', { name: 'Send again' }));

		expect(mocks.retry).toHaveBeenCalledWith({
			tenantId: '11111111-1111-1111-1111-111111111111',
			publicationId: 'pub-8',
		});
	});

	test('clicking Retry fires the retry mutation for that publication only', () => {
		mocks.rows = [
			row({ id: 'pub-2', status: 'failed', failureCategory: 'unknown' }),
			row({ id: 'pub-9', status: 'published' }),
		];
		render(<TenantPostsHistoryPage />);

		fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

		expect(mocks.retry).toHaveBeenCalledTimes(1);
		expect(mocks.retry).toHaveBeenCalledWith({
			tenantId: '11111111-1111-1111-1111-111111111111',
			publicationId: 'pub-2',
		});
	});

	test.each([
		['reconnect', 'Reconnect account', '/tenant/settings/integrations'],
		['fix_content', 'Edit post', '/tenant/posts/post-1/edit'],
	])(
		'%s category offers exactly one deep-linked primary action',
		(category, label, href) => {
			mocks.rows = [
				row({
					status: 'failed',
					externalUrl: null,
					failureCategory: category,
					lastError: 'refused',
				}),
			];
			render(<TenantPostsHistoryPage />);

			const action = screen.getByTestId(
				'tenant-posts-publication-primary-action',
			);
			expect(action.textContent).toBe(label);
			expect(action.getAttribute('href')).toBe(href);
		},
	);

	test('a blank or invisible stored cause falls back to the category sentence (#2013)', () => {
		mocks.rows = [
			row({
				status: 'failed',
				externalUrl: null,
				failureCategory: 'fix_content',
				lastError: null,
			}),
			row({
				id: 'pub-blank',
				status: 'failed',
				externalUrl: null,
				failureCategory: 'unknown',
				lastError: '\u200B\u2800',
			}),
		];
		render(<TenantPostsHistoryPage />);

		const causes = screen
			.getAllByTestId('tenant-posts-publication-cause')
			.map((node) => node.textContent);
		expect(causes).toEqual([
			'Failed: Provider refused content.',
			'Failed: Outcome unclassified.',
		]);
	});

	test('legacy rows without a category read as unknown (failed) or reconnect (paused)', () => {
		mocks.rows = [
			row({ id: 'a', status: 'failed', externalUrl: null }),
			row({ id: 'b', status: 'paused', externalUrl: null }),
		];
		render(<TenantPostsHistoryPage />);

		expect(
			screen
				.getAllByTestId('tenant-posts-history-category-pill')
				.map((node) => node.textContent),
		).toEqual(['Unknown', 'Reconnect']);
	});

	test('Retry is disabled with a tooltip for a paused row whose account still needs reconnecting', () => {
		mocks.rows = [
			row({
				status: 'paused',
				externalUrl: null,
				failureCategory: 'reconnect',
				accountUsable: false,
				lastError: 'account disconnected',
			}),
		];
		render(<TenantPostsHistoryPage />);

		const retry = screen.getByRole('button', { name: 'Retry' });
		expect(retry.hasAttribute('disabled')).toBe(true);
		expect(retry.getAttribute('title')).toBe('Reconnect the account first.');
	});

	test('Retry is disabled without publish permissions', () => {
		mocks.canPublish = false;
		mocks.rows = [row({ status: 'failed', externalUrl: null })];
		render(<TenantPostsHistoryPage />);

		const retry = screen.getByRole('button', { name: 'Retry' });
		expect(retry.hasAttribute('disabled')).toBe(true);
		expect(retry.getAttribute('title')).toBe('Need publish permission.');
	});

	test('a row superseded by a newer publication is muted, labelled Replaced and not a live failure', () => {
		mocks.rows = [
			row({
				status: 'failed',
				externalUrl: null,
				failureCategory: 'retry_later',
				lastError: 'provider unreachable',
				superseded: true,
			}),
		];
		render(<TenantPostsHistoryPage />);

		expect(
			screen.getByTestId('tenant-posts-history-superseded-label').textContent,
		).toBe('Replaced');
		// Muted, never presented as a live failure: no failed pill, no cause,
		// no retry.
		expect(screen.queryByTestId('tenant-posts-history-status-pill')).toBeNull();
		expect(screen.queryByTestId('tenant-posts-publication-cause')).toBeNull();
		expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
		expect(
			document.querySelectorAll('[data-superseded="true"]').length,
		).toBeGreaterThan(0);
	});

	test('a replaced row that did publish keeps its status and its link: the post is still on the provider', () => {
		mocks.rows = [row({ status: 'published', superseded: true })];
		render(<TenantPostsHistoryPage />);

		expect(
			screen.queryByTestId('tenant-posts-history-superseded-label'),
		).toBeNull();
		expect(screen.getByTestId('tenant-posts-history-link')).toBeTruthy();
		expect(
			screen.getByTestId('tenant-posts-history-status-pill').textContent,
		).toBe('Published');
	});

	test('a customized destination carries a Customized badge; a plain one does not', () => {
		mocks.rows = [
			row({ id: 'pub-custom', customized: true }),
			row({ id: 'pub-plain', accountLabel: '@plain.example' }),
		];
		render(<TenantPostsHistoryPage />);

		expect(screen.getAllByTestId('tenant-posts-customized-badge')).toHaveLength(
			1,
		);
		const badge = screen.getByTestId('tenant-posts-customized-badge');
		expect(badge.textContent).toBe('Customized');
		expect(
			badge.closest('tr')?.textContent?.includes('@team.publyapp.dev'),
		).toBe(true);
	});

	test('a failed retry-later row of an unusable account offers Reconnect, not Retry now', () => {
		mocks.rows = [
			row({
				status: 'failed',
				externalUrl: null,
				failureCategory: 'retry_later',
				accountUsable: false,
			}),
		];
		render(<TenantPostsHistoryPage />);

		const action = screen.getByTestId(
			'tenant-posts-publication-primary-action',
		);
		expect(action.textContent).toBe('Reconnect account');
		const retry = screen.getByRole('button', { name: 'Retry' });
		expect(retry.hasAttribute('disabled')).toBe(true);
	});

	test('a plain single-segment post shows no thread progress', () => {
		mocks.rows = [row({})];
		render(<TenantPostsHistoryPage />);

		expect(screen.queryByTestId('tenant-posts-history-segments')).toBeNull();
	});

	test('a failed thread shows how many segments went out and highlights the failing one', () => {
		mocks.rows = [
			row({
				id: 'pub-thread',
				status: 'failed',
				externalUrl: null,
				lastError: 'Published 2 of 5 segments; segment 3 failed: refused',
				segmentsPublished: 2,
				segmentsTotal: 5,
			}),
		];
		render(<TenantPostsHistoryPage />);

		expect(
			screen.getByTestId('tenant-posts-history-segments').textContent,
		).toContain('Thread progress');
		const states = screen
			.getAllByTestId('tenant-posts-history-segment')
			.map((marker) => marker.getAttribute('data-state'));
		expect(states).toEqual([
			'published',
			'published',
			'failed',
			'pending',
			'pending',
		]);
	});

	test('a fully published thread reports the whole thread without a failing segment', () => {
		mocks.rows = [row({ segmentsPublished: 3, segmentsTotal: 3 })];
		render(<TenantPostsHistoryPage />);

		expect(
			screen.getByTestId('tenant-posts-history-segments').textContent,
		).toContain('Whole thread');
		expect(
			screen
				.getAllByTestId('tenant-posts-history-segment')
				.every((marker) => marker.getAttribute('data-state') === 'published'),
		).toBe(true);
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

	test('paused row renders its transparent failure cause and a reconnect primary action', () => {
		mocks.rows = [
			row({
				id: 'pub-paused-cause',
				status: 'paused',
				externalUrl: null,
				failureCategory: 'reconnect',
				accountUsable: false,
				lastError: 'account disconnected',
			}),
		];
		render(<TenantPostsHistoryPage />);

		const cause = screen.getByTestId('tenant-posts-publication-cause');
		expect(cause.textContent).toBe('Paused: account disconnected');
		const action = screen.getByTestId(
			'tenant-posts-publication-primary-action',
		);
		expect(action.getAttribute('href')).toBe('/tenant/settings/integrations');
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
