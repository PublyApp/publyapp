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
import type { ScheduledPublicationRow } from '~/lib/query/tenant-scheduled-publications';
import type { TestLabelMap } from '~/lib/testing/test-label-map';

const mocks = vi.hoisted(() => ({
	shouldLogout: false,
}));

vi.mock('~/lib/api-client/client-manager', () => ({
	getClientManager: () => ({
		getOrCreateClient: () => ({
			posts: { publications: { get: vi.fn() } },
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

// Default all-pages mock: single-page result, overridden per test.
const allPagesMock = vi.hoisted(() => ({
	rows: [] as ScheduledPublicationRow[],
	isAggregating: false,
	shouldLogout: false,
	error: null as Error | null,
	restart: vi.fn(),
}));

vi.mock('./_use-scheduled-publication-all-pages', () => ({
	useScheduledPublicationAllPages: () => allPagesMock,
}));

const EN_LABELS: TestLabelMap = {
	calendar: 'Calendar',
	'calendar-description': 'Scheduled publications grouped by local date.',
	'calendar-empty-title': 'No publications this month',
	'calendar-empty-description': 'Scheduled publications will appear here.',
	'publish-status-scheduled': 'Scheduled',
	'publish-status-paused': 'Paused',
	'posts:publication-paused-cause': 'Paused: {{cause}}',
	'posts:publication-paused-next-action':
		'Reconnect the account in Settings under Integrations to resume.',
	'posts:publication-paused-next-action-aria':
		'Reconnect paused account to resume',
	'posts:publication-paused-next-action-link':
		'Reconnect account in Settings under Integrations',
	'common:calendar': 'Calendar',
	'common:list-unavailable-title': 'List unavailable',
	'common:list-error-default-description': 'An error occurred.',
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
	mocks.shouldLogout = false;
	allPagesMock.rows = [];
	allPagesMock.isAggregating = false;
	allPagesMock.shouldLogout = false;
	allPagesMock.error = null;
	allPagesMock.restart.mockReset();
});

afterEach(() => {
	cleanup();
	vi.useRealTimers();
	process.env.TZ = ORIGINAL_TIME_ZONE;
	vi.clearAllMocks();
});

describe('TenantPostsCalendarPage', () => {
	test('requests and groups the viewer local month across a UTC boundary', async () => {
		allPagesMock.rows = [
			{
				id: 'pub-month-boundary',
				publicationId: 'pub-month-boundary',
				postId: 'post-1',
				postBodyPreview: 'First local day stays visible',
				accountDisplayHandle: '@paris.example',
				status: 'scheduled',
				postStatus: 'scheduled',
				lastError: null,
				scheduledAtUtc: new Date('2026-07-31T22:30:00.000Z'),
				scheduledAtLocal: '2026-08-01T00:30:00+02:00',
				timeZone: 'Europe/Paris',
			},
		];
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
		expect(screen.queryByText(/coming later/i)).toBeNull();
	});

	test('uses the standard empty state for a month without rows', async () => {
		allPagesMock.rows = [];
		renderPage();

		expect(
			await screen.findByTestId('tenant-posts-calendar-empty'),
		).toBeTruthy();
		expect(screen.getByText('No publications this month')).toBeTruthy();
	});

	test('aggregates rows from multiple cursor pages into one combined view', async () => {
		allPagesMock.rows = [
			{
				id: 'pub-page-1',
				publicationId: 'pub-page-1',
				postId: 'post-1',
				postBodyPreview: 'First calendar page',
				accountDisplayHandle: null,
				status: 'scheduled',
				postStatus: 'scheduled',
				lastError: null,
				scheduledAtUtc: new Date('2026-08-10T10:00:00.000Z'),
				scheduledAtLocal: '2026-08-10T12:00:00+02:00',
				timeZone: 'Europe/Paris',
			},
			{
				id: 'pub-page-2',
				publicationId: 'pub-page-2',
				postId: 'post-2',
				postBodyPreview: 'Second calendar page',
				accountDisplayHandle: null,
				status: 'paused',
				postStatus: 'scheduled',
				lastError: null,
				scheduledAtUtc: new Date('2026-08-20T10:00:00.000Z'),
				scheduledAtLocal: '2026-08-20T12:00:00+02:00',
				timeZone: 'Europe/Paris',
			},
		];
		renderPage();

		expect(await screen.findByText('First calendar page')).toBeTruthy();
		expect(screen.getByText('Second calendar page')).toBeTruthy();

		const day1 = screen.getByTestId('tenant-posts-calendar-day-2026-08-10');
		expect(day1.textContent).toContain('First calendar page');
		const day2 = screen.getByTestId('tenant-posts-calendar-day-2026-08-20');
		expect(day2.textContent).toContain('Second calendar page');
	});

	test('agenda rows link to the post edit page so the operator can resolve them', async () => {
		allPagesMock.rows = [
			{
				id: 'pub-link',
				publicationId: 'pub-link',
				postId: 'post-link',
				postBodyPreview: 'Linked calendar entry',
				accountDisplayHandle: '@link.example',
				status: 'paused',
				postStatus: 'scheduled',
				lastError: null,
				scheduledAtUtc: new Date('2026-08-12T09:00:00.000Z'),
				scheduledAtLocal: '2026-08-12T11:00:00+02:00',
				timeZone: 'Europe/Paris',
			},
		];
		renderPage();

		const day = await screen.findByTestId(
			'tenant-posts-calendar-day-2026-08-12',
		);
		const link = day.querySelector('a');
		expect(link).not.toBeNull();
		expect(link?.getAttribute('href')).toBe('/tenant/posts/post-link/edit');
		expect(link?.textContent).toContain('Linked calendar entry');
	});

	test('agenda row renders the transparent pause cause with a reconnect next action', async () => {
		allPagesMock.rows = [
			{
				id: 'pub-paused-cause',
				publicationId: 'pub-paused-cause',
				postId: 'post-paused-cause',
				postBodyPreview: 'Paused with a stored cause',
				accountDisplayHandle: '@paused.example',
				status: 'paused',
				postStatus: 'scheduled',
				lastError: 'account disconnected',
				scheduledAtUtc: new Date('2026-08-12T09:00:00.000Z'),
				scheduledAtLocal: '2026-08-12T11:00:00+02:00',
				timeZone: 'Europe/Paris',
			},
		];
		renderPage();

		await screen.findByText('Paused with a stored cause');
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

	test('groups by scheduledAtUtc in the viewer zone, not the publication zone', async () => {
		// A publication at 2026-07-31T22:30 UTC is in the Europe/Paris viewer
		// zone on 2026-08-01, but its publication zone (e.g. America/New_York)
		// would show 2026-07-31. The viewer-zone proof requires that the
		// grouping date is derived from scheduledAtUtc via the viewer's local
		// calendar, not from scheduledAtLocal's date component.
		allPagesMock.rows = [
			{
				id: 'pub-zone-proof',
				publicationId: 'pub-zone-proof',
				postId: 'post-zone',
				postBodyPreview: 'Zone divergence proof',
				accountDisplayHandle: '@zone.example',
				status: 'scheduled',
				postStatus: 'scheduled',
				lastError: null,
				scheduledAtUtc: new Date('2026-07-31T22:30:00.000Z'),
				scheduledAtLocal: '2026-07-31T18:30:00-04:00',
				timeZone: 'America/New_York',
			},
		];
		renderPage();

		expect(await screen.findByText('Zone divergence proof')).toBeTruthy();
		// Viewer zone (Europe/Paris) sees 2026-08-01, NOT 2026-07-31.
		expect(
			screen.getByTestId('tenant-posts-calendar-day-2026-08-01'),
		).toBeTruthy();
		expect(
			screen.queryByTestId('tenant-posts-calendar-day-2026-07-31'),
		).toBeNull();
	});

	test('logs out only when the centralized failure classifier selects the error', async () => {
		allPagesMock.shouldLogout = true;
		renderPage();

		await waitFor(() => {
			expect(screen.getByTestId('logout-redirect')).toBeTruthy();
		});
	});

	test('restarts the complete cursor walk from the error view', async () => {
		allPagesMock.error = new Error('request failed');
		renderPage();

		fireEvent.click(
			await screen.findByRole('button', { name: 'common:retry' }),
		);

		expect(allPagesMock.restart).toHaveBeenCalledOnce();
	});
});
