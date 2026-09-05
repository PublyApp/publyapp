/**
 * @vitest-environment jsdom
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import type { ComponentType, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { TestLabelMap } from '~/lib/testing/test-label-map';

const mocks = vi.hoisted(() => ({
	get: vi.fn(),
	shouldLogout: false,
}));

vi.mock('~/lib/api-client/client-manager', () => ({
	getClientManager: () => ({
		getOrCreateClient: () => ({
			posts: { publications: { get: mocks.get } },
		}),
	}),
	resolveApiBaseUrl: () => 'https://api.example.test',
}));

vi.mock('~/lib/query/tenants-for-picker', () => ({
	useResolvedWorkspaceTenantId: () => 'tenant-1',
}));

vi.mock('@org/shared-ts/lib/should-logout-for-failure', () => ({
	shouldLogoutForFailure: () => mocks.shouldLogout,
}));

vi.mock('~/components/error-views/LogoutRedirect', () => ({
	LogoutRedirect: () => <div data-testid="logout-redirect" />,
}));

vi.mock('@tanstack/react-router', () => ({
	createFileRoute: () => (options: Record<string, unknown>) => ({
		...options,
		options,
	}),
	Link: ({
		children,
		to,
		params,
		...props
	}: {
		children: ReactNode;
		to: string;
		params?: Record<string, string>;
	}) => {
		let href = to;
		for (const [key, value] of Object.entries(params ?? {})) {
			href = href.replace(`$${key}`, value);
		}
		return (
			<a href={href} {...props}>
				{children}
			</a>
		);
	},
}));

const EN_LABELS: TestLabelMap = {
	queue: 'Queue',
	'queue-description': 'Upcoming publications across your connected accounts.',
	'queue-empty-title': 'No queued publications',
	'queue-empty-description': 'Scheduled publications will appear here.',
	'queue-post-label': 'Post',
	'queue-account-label': 'Account',
	'queue-status-label': 'Status',
	'queue-scheduled-label': 'Scheduled for',
	'publish-status-scheduled': 'Scheduled',
	'publish-status-in-progress': 'In progress…',
	'publish-status-paused': 'Paused',
	'posts:publication-open-post': 'Open post',
	'posts:publication-failed-cause': 'Failed: {{cause}}',
	'posts:publication-paused-cause': 'Paused: {{cause}}',
	'posts:publication-paused-next-action':
		'Reconnect the account in Settings under Integrations to resume.',
	'posts:publication-paused-next-action-aria':
		'Reconnect paused account to resume',
	'posts:publication-paused-next-action-link':
		'Reconnect account in Settings under Integrations',
	'common:queue': 'Queue',
	'read-only': 'Read only',
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
import { Route } from './queue';

const TenantPostsQueuePage = Route.options.component as ComponentType;

const renderPage = () => {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	const Wrapper = ({ children }: { children: ReactNode }) => (
		<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
	);

	return render(<TenantPostsQueuePage />, { wrapper: Wrapper });
};

beforeEach(() => {
	mocks.get.mockResolvedValue({
		data: [
			{
				publicationId: 'pub-1',
				postId: 'post-1',
				postBodyPreview: 'A real scheduled post',
				accountDisplayHandle: '@publy.example',
				status: 'scheduled',
				postStatus: 'scheduled',
				scheduledAtUtc: new Date('2026-08-31T18:30:00.000Z'),
				scheduledAtLocal: '2026-08-31T20:30:00+02:00',
				timeZone: 'Europe/Paris',
			},
			{
				publicationId: 'pub-2',
				postId: 'post-2',
				postBodyPreview: 'Paused after account disconnect',
				accountDisplayHandle: '@paused.example',
				status: 'paused',
				postStatus: 'scheduled',
				lastError: 'account disconnected',
				scheduledAtUtc: new Date('2026-09-01T18:30:00.000Z'),
				scheduledAtLocal: '2026-09-01T20:30:00+02:00',
				timeZone: 'Europe/Paris',
			},
		],
		nextCursor: null,
	});
	mocks.shouldLogout = false;
});

afterEach(() => {
	cleanup();
	vi.useRealTimers();
	vi.clearAllMocks();
});

describe('TenantPostsQueuePage', () => {
	test('renders real queue rows in backend order with status and supplied schedule', async () => {
		renderPage();

		expect(screen.getByRole('heading', { name: 'Queue' })).toBeTruthy();
		expect(await screen.findByText('A real scheduled post')).toBeTruthy();
		expect(screen.getByText('Paused after account disconnect')).toBeTruthy();
		expect(
			screen
				.getAllByRole('row')[1]
				?.textContent?.indexOf('A real scheduled post'),
		).toBeGreaterThan(-1);
		expect(screen.getByText('Scheduled')).toBeTruthy();
		expect(screen.getByText('Paused')).toBeTruthy();
		expect(screen.getByText('Paused: account disconnected')).toBeTruthy();
		expect(
			screen
				.getByRole('link', {
					name: 'Reconnect paused account to resume',
				})
				.getAttribute('href'),
		).toBe('/tenant/settings/integrations');
		expect(screen.getByText(/2026-08-31 20:30/)).toBeTruthy();
		expect(screen.getAllByText('Europe/Paris').length).toBeGreaterThan(0);
		expect(screen.queryByText(/coming later/i)).toBeNull();
	});

	test('owns scrolling inside the publy-page-fill chain', async () => {
		renderPage();
		await screen.findByText('A real scheduled post');

		const pageRoot = screen.getByTestId('tenant-posts-queue-page');
		expect(pageRoot.className).toContain('publy-page-fill');

		const tableShell = screen.getByTestId('tenant-posts-queue-table');
		expect(pageRoot.contains(tableShell)).toBe(true);
	});

	test('uses the standard empty table state instead of the placeholder', async () => {
		mocks.get.mockResolvedValue({ data: [], nextCursor: null });
		renderPage();

		expect(
			await screen.findByTestId('tenant-posts-queue-table-empty'),
		).toBeTruthy();
		expect(screen.getByText('No queued publications')).toBeTruthy();
	});

	test('logs out only when the centralized failure classifier selects the error', async () => {
		mocks.get.mockRejectedValue(new Error('invalid session'));
		mocks.shouldLogout = true;
		renderPage();

		await waitFor(() => {
			expect(screen.getByTestId('logout-redirect')).toBeTruthy();
		});
	});

	test('polls while a publication is in progress', async () => {
		vi.useFakeTimers({ shouldAdvanceTime: true });
		mocks.get.mockResolvedValue({
			data: [
				{
					publicationId: 'pub-progress',
					postId: 'post-progress',
					postBodyPreview: 'Publishing now',
					accountDisplayHandle: '@publy.example',
					status: 'in_progress',
					postStatus: 'scheduled',
					scheduledAtUtc: new Date('2026-08-31T18:30:00.000Z'),
					scheduledAtLocal: '2026-08-31T20:30:00+02:00',
					timeZone: 'Europe/Paris',
				},
			],
			nextCursor: null,
		});
		renderPage();
		await screen.findByText('Publishing now');
		const initialCalls = mocks.get.mock.calls.length;

		await act(() => vi.advanceTimersByTime(5_000));

		await waitFor(() => {
			expect(mocks.get.mock.calls.length).toBeGreaterThan(initialCalls);
		});
	});

	test('does not poll while every publication is stable', async () => {
		vi.useFakeTimers({ shouldAdvanceTime: true });
		mocks.get.mockResolvedValue({
			data: [
				{
					publicationId: 'pub-paused',
					postId: 'post-paused',
					postBodyPreview: 'Paused after account disconnect',
					accountDisplayHandle: '@paused.example',
					status: 'paused',
					postStatus: 'scheduled',
					lastError: 'account disconnected',
					scheduledAtUtc: new Date('2026-09-01T18:30:00.000Z'),
					scheduledAtLocal: '2026-09-01T20:30:00+02:00',
					timeZone: 'Europe/Paris',
				},
			],
			nextCursor: null,
		});
		renderPage();
		await screen.findByText('Paused after account disconnect');
		const initialCalls = mocks.get.mock.calls.length;

		await act(() => vi.advanceTimersByTime(6_000));

		expect(mocks.get).toHaveBeenCalledTimes(initialCalls);
	});

	test('walks through scheduled -> in_progress -> published and stops polling afterwards', async () => {
		vi.useFakeTimers({ shouldAdvanceTime: true });
		vi.setSystemTime(new Date('2026-08-31T18:30:00.000Z'));
		mocks.get
			.mockResolvedValueOnce({
				data: [
					{
						publicationId: 'pub-walk',
						postId: 'post-walk',
						postBodyPreview: 'Walk me through',
						accountDisplayHandle: '@publy.example',
						status: 'scheduled',
						postStatus: 'scheduled',
						scheduledAtUtc: new Date('2026-08-31T18:30:00.000Z'),
						scheduledAtLocal: '2026-08-31T20:30:00+02:00',
						timeZone: 'Europe/Paris',
					},
				],
				nextCursor: null,
			})
			.mockResolvedValueOnce({
				data: [
					{
						publicationId: 'pub-walk',
						postId: 'post-walk',
						postBodyPreview: 'Walk me through',
						accountDisplayHandle: '@publy.example',
						status: 'in_progress',
						postStatus: 'scheduled',
						scheduledAtUtc: new Date('2026-08-31T18:30:00.000Z'),
						scheduledAtLocal: '2026-08-31T20:30:00+02:00',
						timeZone: 'Europe/Paris',
					},
				],
				nextCursor: null,
			})
			.mockResolvedValueOnce({
				data: [
					{
						publicationId: 'pub-walk',
						postId: 'post-walk',
						postBodyPreview: 'Walk me through',
						accountDisplayHandle: '@publy.example',
						status: 'published',
						postStatus: 'published',
						scheduledAtUtc: new Date('2026-08-31T18:30:00.000Z'),
						scheduledAtLocal: '2026-08-31T20:30:00+02:00',
						timeZone: 'Europe/Paris',
					},
				],
				nextCursor: null,
			})
			.mockResolvedValue({
				data: [],
				nextCursor: null,
			});
		renderPage();
		await screen.findByText('Walk me through');
		const initialCalls = mocks.get.mock.calls.length;
		expect(initialCalls).toBe(1);

		await act(async () => {
			await vi.advanceTimersByTimeAsync(5_000);
		});
		await act(async () => {
			await vi.advanceTimersByTimeAsync(5_000);
		});
		await act(async () => {
			await vi.advanceTimersByTimeAsync(5_000);
		});

		await waitFor(() => {
			expect(mocks.get.mock.calls.length).toBe(3);
		});

		const callsAfterStop = mocks.get.mock.calls.length;
		await act(async () => {
			await vi.advanceTimersByTimeAsync(10_000);
		});
		expect(mocks.get.mock.calls.length).toBe(callsAfterStop);
	});

	test('waits until the next scheduled instant before refetching', async () => {
		vi.useFakeTimers({ shouldAdvanceTime: true });
		vi.setSystemTime(new Date('2026-08-31T18:00:00.000Z'));
		mocks.get.mockResolvedValueOnce({
			data: [
				{
					publicationId: 'pub-future',
					postId: 'post-future',
					postBodyPreview: 'Future scheduled',
					accountDisplayHandle: '@publy.example',
					status: 'scheduled',
					postStatus: 'scheduled',
					scheduledAtUtc: new Date('2026-08-31T18:00:12.000Z'),
					scheduledAtLocal: '2026-08-31T20:00:12+02:00',
					timeZone: 'Europe/Paris',
				},
			],
			nextCursor: null,
		});
		mocks.get.mockResolvedValue({
			data: [],
			nextCursor: null,
		});
		renderPage();
		await screen.findByText('Future scheduled');
		const initialCalls = mocks.get.mock.calls.length;
		expect(initialCalls).toBe(1);

		await act(async () => {
			await vi.advanceTimersByTimeAsync(6_000);
		});
		expect(mocks.get.mock.calls.length).toBe(initialCalls);

		await act(async () => {
			await vi.advanceTimersByTimeAsync(6_000);
		});
		expect(mocks.get.mock.calls.length).toBeGreaterThan(initialCalls);
	});

	test("links a queue row's post to its edit page so the operator can open it", async () => {
		renderPage();
		await screen.findByText('A real scheduled post');

		const link = screen.getByRole('link', { name: 'A real scheduled post' });
		expect(link.getAttribute('href')).toBe('/tenant/posts/post-1/edit');
		// The link carries the shared "Open post" affordance label.
		expect(link.getAttribute('title')).toBe('Open post');
	});

	test('shows the transparent pause cause with a reconnect next action under the status', async () => {
		mocks.get.mockResolvedValue({
			data: [
				{
					publicationId: 'pub-paused-cause',
					postId: 'post-paused-cause',
					postBodyPreview: 'Paused row with a stored cause',
					accountDisplayHandle: '@paused.example',
					status: 'paused',
					postStatus: 'scheduled',
					lastError: 'token expired',
					scheduledAtUtc: new Date('2026-09-01T18:30:00.000Z'),
					scheduledAtLocal: '2026-09-01T20:30:00+02:00',
					timeZone: 'Europe/Paris',
				},
			],
			nextCursor: null,
		});
		renderPage();
		await screen.findByText('Paused row with a stored cause');

		const cause = screen.getByTestId('tenant-posts-publication-cause');
		expect(cause.textContent).toContain('Paused: token expired');
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

	test('sends a from query parameter 24 hours in the past so a row due seconds before page open is visible', async () => {
		// The queue page opens, an operator navigates to /tenant/posts/queue,
		// the page fetches with `from = now - 24h`. The API filter
		// `ScheduledAtUtc >= FromUtc` would otherwise exclude any row due
		// seconds before the page opens — leaving the page empty even though
		// the worker has not yet picked the row up. The page therefore uses a
		// 24-hour past grace on the queue window, kept narrow enough that
		// ancient scheduled rows cannot bleed in. The grace is verified here
		// by inspecting the query parameters the page sends to the API client.
		vi.useFakeTimers({ shouldAdvanceTime: true });
		vi.setSystemTime(new Date('2026-08-31T18:30:00.000Z'));
		mocks.get.mockResolvedValue({
			data: [],
			nextCursor: null,
		});
		renderPage();
		await screen.findByTestId('tenant-posts-queue-page');

		expect(mocks.get).toHaveBeenCalledTimes(1);
		const args = mocks.get.mock.calls[0]?.[0] as {
			queryParameters?: { from?: string; to?: string };
		};
		const fromIso = args?.queryParameters?.from;
		const toIso = args?.queryParameters?.to;
		expect(fromIso).toBeDefined();
		expect(toIso).toBeDefined();
		const fromMs = new Date(fromIso!).valueOf();
		const toMs = new Date(toIso!).valueOf();
		const nowMs = new Date('2026-08-31T18:30:00.000Z').valueOf();
		// 24h past grace (bounded) + 31d future horizon, exactly the 32d
		// API maximum window — anything wider than that 422s.
		expect(nowMs - fromMs).toBe(24 * 60 * 60 * 1000);
		expect(toMs - fromMs).toBe(32 * 24 * 60 * 60 * 1000);
	});
});
