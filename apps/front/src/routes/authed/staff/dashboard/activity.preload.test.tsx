/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import {
	countCallsByPath,
	type FakeClientCall,
	type FakeResponse,
	type PreloadDestination,
	preloadedQueries,
	renderPreloadScenario,
	requestQueryParameters,
	warmedSnapshot,
	widenOptions,
} from '~/routes/authed/staff/_preload-test-harness';
import { Route as DashboardRoute } from '~/routes/authed/staff/dashboard/activity';

const mocks = vi.hoisted(() => ({
	respond: vi.fn((_call: FakeClientCall): FakeResponse => ({})),
}));

vi.mock('~/lib/api-client/client-manager', async () => {
	const actual = await vi.importActual<
		typeof import('~/lib/api-client/client-manager')
	>('~/lib/api-client/client-manager');
	const { buildFakeApiClient } =
		await import('~/routes/authed/staff/_preload-test-harness');
	const fakeClient = buildFakeApiClient(mocks.respond);

	return {
		...actual,
		getClientManager: () => ({
			getOrCreateClient: () => fakeClient,
			getOrCreateStaffClient: () => fakeClient,
			getOrCreateTenantScopeClient: () => fakeClient,
			getOrCreateAnonymousClient: () => fakeClient,
			getOrCreateSessionClient: () => fakeClient,
			clearClients: () => {},
		}),
	};
});

vi.mock('~/lib/hooks/use-logout', () => ({
	useLogout: () => ({ logout: vi.fn() }),
}));

vi.mock('~/components/error-views/LogoutRedirect', () => ({
	LogoutRedirect: () => <div data-testid="logout-redirect">logout</div>,
}));

vi.mock('react-i18next', async (importOriginal) => {
	const actual = await importOriginal<typeof import('react-i18next')>();

	return {
		...actual,
		useTranslation: () => ({
			t: (key: string) => key,
			i18n: { language: 'en' },
		}),
	};
});

const LINK_LABEL = 'open dashboard';
const TENANTS = ['staff', 'tenants', 'get'] as const;
const AUDIT = ['staff', 'auditLogs', 'get'] as const;
const ACTIONS = ['staff', 'auditLogs', 'actions', 'get'] as const;

const destinationFor = (linkSearch?: Record<string, string>) =>
	widenOptions<PreloadDestination>({
		linkTo: '/staff/dashboard/activity',
		linkSearch,
		path: '/staff/dashboard/activity',
		options: DashboardRoute.options,
	});

const settle = async (queryClient: { isFetching: () => number }) => {
	await waitFor(() => {
		expect(countCallsByPath(mocks.respond, ...AUDIT)).toBe(1);
		expect(countCallsByPath(mocks.respond, ...TENANTS)).toBe(1);
		expect(countCallsByPath(mocks.respond, ...ACTIONS)).toBe(1);
	});
	await waitFor(() => {
		expect(queryClient.isFetching()).toBe(0);
	});
};

describe('#2340 staff dashboard activity route preload', () => {
	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
		mocks.respond.mockReset();
	});

	test('hovering warms the tenant names, the registry and the feed once, with the URL filters in the request', async () => {
		const { queryClient } = renderPreloadScenario({
			destination: destinationFor({ period: 'week', q: 'login' }),
			linkLabel: LINK_LABEL,
		});
		const link = await screen.findByRole('link', { name: LINK_LABEL });
		expect(mocks.respond).not.toHaveBeenCalled();

		fireEvent.mouseEnter(link);
		await settle(queryClient);

		expect(preloadedQueries(queryClient)).toHaveLength(3);
		expect(requestQueryParameters(mocks.respond, ...TENANTS)).toContainEqual(
			expect.objectContaining({ limit: '100' }),
		);
		// The feed is 50 rows deep, newest first, with the URL's search and period.
		expect(requestQueryParameters(mocks.respond, ...AUDIT)).toContainEqual(
			expect.objectContaining({
				limit: '50',
				sortId: 'created_at',
				sortOrder: 'desc',
				q: 'login',
				startDate: expect.any(String),
			}),
		);
		expect(screen.queryByTestId('staff-dashboard-activity')).toBeNull();
	});

	test('clicking after the preload paints the page from cache with no refetch', async () => {
		const { queryClient } = renderPreloadScenario({
			destination: destinationFor({ period: 'week' }),
			linkLabel: LINK_LABEL,
		});
		const link = await screen.findByRole('link', { name: LINK_LABEL });

		fireEvent.mouseEnter(link);
		await settle(queryClient);

		const warmed = preloadedQueries(queryClient);
		const snapshot = warmedSnapshot(warmed);
		const calls = mocks.respond.mock.calls.length;

		fireEvent.click(link);
		await waitFor(() => {
			expect(screen.getByTestId('staff-dashboard-activity')).toBeTruthy();
		});

		expect(warmed).toHaveLength(3);
		for (const query of warmed) {
			expect(query.getObserversCount()).toBeGreaterThan(0);
			expect(query.state.dataUpdatedAt).toBe(snapshot.get(query.queryKey));
		}
		expect(mocks.respond.mock.calls).toHaveLength(calls);
	});

	test('a category filter with a cold registry warms the filtered feed once the registry lands', async () => {
		mocks.respond.mockImplementation((call) =>
			call.path.includes('actions')
				? { actions: ['auth.login', 'auth.logout', 'tenant.created'] }
				: {},
		);
		const { queryClient } = renderPreloadScenario({
			destination: destinationFor({ category: 'auth' }),
			linkLabel: LINK_LABEL,
		});
		const link = await screen.findByRole('link', { name: LINK_LABEL });

		fireEvent.mouseEnter(link);
		await settle(queryClient);

		expect(requestQueryParameters(mocks.respond, ...AUDIT)).toContainEqual(
			expect.objectContaining({ actions: 'auth.login,auth.logout' }),
		);
		const warmed = preloadedQueries(queryClient);
		const snapshot = warmedSnapshot(warmed);

		fireEvent.click(link);
		await waitFor(() => {
			expect(screen.getByTestId('staff-dashboard-activity')).toBeTruthy();
		});

		for (const query of warmed) {
			expect(query.getObserversCount()).toBeGreaterThan(0);
			expect(query.state.dataUpdatedAt).toBe(snapshot.get(query.queryKey));
		}
		expect(countCallsByPath(mocks.respond, ...AUDIT)).toBe(1);
	});
});
