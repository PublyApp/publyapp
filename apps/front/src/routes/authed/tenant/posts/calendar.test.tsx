/**
 * @vitest-environment jsdom
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from '@testing-library/react';
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
	calendar: 'Calendar',
	'calendar-description': 'Scheduled publications grouped by local date.',
	'calendar-empty-title': 'No publications this month',
	'calendar-empty-description': 'Scheduled publications will appear here.',
	'publish-status-scheduled': 'Scheduled',
	'common:calendar': 'Calendar',
	'read-only': 'Read only',
};

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string) => EN_LABELS[key] ?? key,
		i18n: { resolvedLanguage: 'en', language: 'en' },
	}),
}));

// eslint-disable-next-line import/first -- must follow the vi.mock calls above
import { Route } from './calendar';

const TenantPostsCalendarPage = Route.options.component as ComponentType;
const ORIGINAL_TIME_ZONE = process.env.TZ;

const renderPage = () => {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	const Wrapper = ({ children }: { children: ReactNode }) => (
		<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
	);

	return render(<TenantPostsCalendarPage />, { wrapper: Wrapper });
};

beforeEach(() => {
	process.env.TZ = 'Europe/Paris';
	vi.useFakeTimers({ toFake: ['Date'] });
	vi.setSystemTime(new Date('2026-08-01T01:00:00.000Z'));
	mocks.get.mockResolvedValue({
		data: [
			{
				publicationId: 'pub-month-boundary',
				postId: 'post-1',
				postBodyPreview: 'First local day stays visible',
				accountDisplayHandle: '@paris.example',
				status: 'scheduled',
				postStatus: 'scheduled',
				scheduledAtUtc: new Date('2026-07-31T22:30:00.000Z'),
				scheduledAtLocal: '2026-08-01T00:30:00+02:00',
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
	process.env.TZ = ORIGINAL_TIME_ZONE;
	vi.clearAllMocks();
});

describe('TenantPostsCalendarPage', () => {
	test('requests and groups the viewer local month across a UTC boundary', async () => {
		renderPage();

		expect(screen.getByRole('heading', { name: 'Calendar' })).toBeTruthy();
		expect(
			await screen.findByText('First local day stays visible'),
		).toBeTruthy();
		const day = screen.getByTestId('tenant-posts-calendar-day-2026-08-01');
		expect(day.textContent).toContain('2026-08-01 00:30');
		expect(day.textContent).toContain('Europe/Paris');
		expect(
			screen.queryByTestId('tenant-posts-calendar-day-2026-07-31'),
		).toBeNull();
		expect(mocks.get).toHaveBeenCalledWith({
			queryParameters: expect.objectContaining({
				from: '2026-07-31T22:00:00.000Z',
				to: '2026-08-31T21:59:59.999Z',
			}),
		});
		expect(screen.getByTestId('account-read-only-badge')).toBeTruthy();
		expect(screen.queryByText(/coming later/i)).toBeNull();
	});

	test('uses the standard empty state for a month without rows', async () => {
		mocks.get.mockResolvedValue({ data: [], nextCursor: null });
		renderPage();

		expect(
			await screen.findByTestId('tenant-posts-calendar-empty'),
		).toBeTruthy();
		expect(screen.getByText('No publications this month')).toBeTruthy();
	});

	test('follows the backend cursor instead of hiding later month rows', async () => {
		mocks.get.mockResolvedValueOnce({
			data: [
				{
					publicationId: 'pub-page-1',
					postBodyPreview: 'First calendar page',
					status: 'scheduled',
					scheduledAtUtc: new Date('2026-08-10T10:00:00.000Z'),
					scheduledAtLocal: '2026-08-10T12:00:00+02:00',
					timeZone: 'Europe/Paris',
				},
			],
			nextCursor: 'calendar-cursor-2',
		});
		mocks.get.mockResolvedValueOnce({
			data: [
				{
					publicationId: 'pub-page-2',
					postBodyPreview: 'Second calendar page',
					status: 'paused',
					scheduledAtUtc: new Date('2026-08-20T10:00:00.000Z'),
					scheduledAtLocal: '2026-08-20T12:00:00+02:00',
					timeZone: 'Europe/Paris',
				},
			],
			nextCursor: null,
		});
		renderPage();

		expect(await screen.findByText('First calendar page')).toBeTruthy();
		fireEvent.click(screen.getByTestId('tenant-posts-calendar-next-page'));

		expect(await screen.findByText('Second calendar page')).toBeTruthy();
		expect(mocks.get).toHaveBeenLastCalledWith({
			queryParameters: expect.objectContaining({
				cursor: 'calendar-cursor-2',
			}),
		});
	});

	test('logs out only when the centralized failure classifier selects the error', async () => {
		mocks.get.mockRejectedValue(new Error('invalid session'));
		mocks.shouldLogout = true;
		renderPage();

		await waitFor(() => {
			expect(screen.getByTestId('logout-redirect')).toBeTruthy();
		});
	});
});
