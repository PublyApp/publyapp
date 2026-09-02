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
	'common:queue': 'Queue',
	'read-only': 'Read only',
};

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string) => EN_LABELS[key] ?? key,
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
		renderPage();
		await screen.findByText('A real scheduled post');
		const initialCalls = mocks.get.mock.calls.length;

		await act(() => vi.advanceTimersByTime(6_000));

		expect(mocks.get).toHaveBeenCalledTimes(initialCalls);
	});
});
