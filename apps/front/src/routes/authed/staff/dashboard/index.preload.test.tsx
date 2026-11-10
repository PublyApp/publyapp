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
import { Route as DashboardRoute } from '~/routes/authed/staff/dashboard/index';

import {
	addIsoDays,
	heatmapWindow,
	periodStart,
	previousPeriod,
	todayIso,
} from './_dashboard-filters';

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
const INVITATIONS = ['staff', 'invitations', 'get'] as const;
const AUDIT = ['staff', 'auditLogs', 'get'] as const;
const SERIES = ['staff', 'dashboard', 'series', 'get'] as const;

const destination = widenOptions<PreloadDestination>({
	linkTo: '/staff/dashboard',
	linkSearch: { period: '7d', scope: 'suspended' },
	path: '/staff/dashboard',
	options: DashboardRoute.options,
});

const settle = async (queryClient: { isFetching: () => number }) => {
	await waitFor(() => {
		expect(countCallsByPath(mocks.respond, ...SERIES)).toBe(4);
	});
	await waitFor(() => {
		expect(queryClient.isFetching()).toBe(0);
	});
};

describe('#2340 staff dashboard overview route preload', () => {
	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
		mocks.respond.mockReset();
	});

	test('hovering warms each of the nine queries once, with the URL filters in the request', async () => {
		const { queryClient } = renderPreloadScenario({
			destination,
			linkLabel: LINK_LABEL,
		});
		const link = await screen.findByRole('link', { name: LINK_LABEL });
		expect(mocks.respond).not.toHaveBeenCalled();

		fireEvent.mouseEnter(link);
		await settle(queryClient);

		expect(countCallsByPath(mocks.respond, ...TENANTS)).toBe(2);
		expect(countCallsByPath(mocks.respond, ...INVITATIONS)).toBe(2);
		expect(countCallsByPath(mocks.respond, ...AUDIT)).toBe(1);
		expect(preloadedQueries(queryClient)).toHaveLength(9);

		// The scope reaches only the « Dernières organisations » request.
		const tenants = requestQueryParameters(mocks.respond, ...TENANTS);
		expect(tenants).toContainEqual(
			expect.objectContaining({
				limit: '5',
				status: 'suspended',
				sortId: 'created_at',
				sortOrder: 'desc',
			}),
		);
		expect(tenants).toContainEqual(
			expect.objectContaining({ limit: '1', status: undefined }),
		);
		const invitations = requestQueryParameters(mocks.respond, ...INVITATIONS);
		expect(invitations).toContainEqual(
			expect.objectContaining({ limit: '5', status: 'pending' }),
		);
		expect(invitations).toContainEqual(
			expect.objectContaining({ limit: '1', status: undefined }),
		);

		// The period reaches the audit request and every series window.
		const today = todayIso();
		const start = periodStart('7d');
		expect(requestQueryParameters(mocks.respond, ...AUDIT)).toContainEqual(
			expect.objectContaining({ limit: '1', startDate: start }),
		);
		const series = requestQueryParameters(mocks.respond, ...SERIES);
		expect(series).toContainEqual({
			metric: 'active_tenants',
			startDate: start,
			endDate: today,
		});
		expect(series).toContainEqual({
			metric: 'audit_events',
			startDate: start,
			endDate: today,
		});
		expect(series).toContainEqual({
			metric: 'audit_events',
			...previousPeriod('7d'),
		});
		expect(series).toContainEqual({
			metric: 'audit_events',
			startDate: addIsoDays(today, -364),
			endDate: heatmapWindow().endDate,
		});
		expect(screen.queryByTestId('staff-dashboard-overview-panel')).toBeNull();
	});

	test('clicking after the preload paints the page from cache with no refetch', async () => {
		const { queryClient } = renderPreloadScenario({
			destination,
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
			expect(screen.getByTestId('staff-dashboard-overview-panel')).toBeTruthy();
		});

		expect(warmed).toHaveLength(9);
		for (const query of warmed) {
			expect(query.getObserversCount()).toBeGreaterThan(0);
			expect(query.state.dataUpdatedAt).toBe(snapshot.get(query.queryKey));
		}
		expect(mocks.respond.mock.calls).toHaveLength(calls);
	});
});
