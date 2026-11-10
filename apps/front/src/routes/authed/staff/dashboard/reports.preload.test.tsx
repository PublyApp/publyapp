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
import { Route as DashboardRoute } from '~/routes/authed/staff/dashboard/reports';

import { periodStart, previousPeriod, todayIso } from './_dashboard-filters';

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
const AUDIT = ['staff', 'auditLogs', 'get'] as const;
const SERIES = ['staff', 'dashboard', 'series', 'get'] as const;
const TOP = ['staff', 'dashboard', 'topOrganisations', 'get'] as const;

const destination = widenOptions<PreloadDestination>({
	linkTo: '/staff/dashboard/reports',
	linkSearch: { period: '90d' },
	path: '/staff/dashboard/reports',
	options: DashboardRoute.options,
});

const settle = async (queryClient: { isFetching: () => number }) => {
	await waitFor(() => {
		expect(countCallsByPath(mocks.respond, ...SERIES)).toBe(6);
		expect(countCallsByPath(mocks.respond, ...TOP)).toBe(1);
	});
	await waitFor(() => {
		expect(queryClient.isFetching()).toBe(0);
	});
};

describe('#2340 staff dashboard reports route preload', () => {
	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
		mocks.respond.mockReset();
	});

	test('hovering warms each of the nine queries once, with the period in the request', async () => {
		const { queryClient } = renderPreloadScenario({
			destination,
			linkLabel: LINK_LABEL,
		});
		const link = await screen.findByRole('link', { name: LINK_LABEL });
		expect(mocks.respond).not.toHaveBeenCalled();

		fireEvent.mouseEnter(link);
		await settle(queryClient);

		expect(countCallsByPath(mocks.respond, ...AUDIT)).toBe(2);
		expect(preloadedQueries(queryClient)).toHaveLength(9);

		const today = todayIso();
		const start = periodStart('90d');
		const previous = previousPeriod('90d');
		const audit = requestQueryParameters(mocks.respond, ...AUDIT);
		expect(audit).toContainEqual(
			expect.objectContaining({ limit: '1', startDate: start }),
		);
		expect(audit).toContainEqual(
			expect.objectContaining({
				limit: '1',
				startDate: start,
				actions: 'impersonation.started',
			}),
		);
		const series = requestQueryParameters(mocks.respond, ...SERIES);
		for (const metric of ['audit_events', 'sign_ins', 'failed_sign_ins']) {
			expect(series).toContainEqual({
				metric,
				startDate: start,
				endDate: today,
			});
			expect(series).toContainEqual({ metric, ...previous });
		}
		expect(requestQueryParameters(mocks.respond, ...TOP)).toContainEqual({
			startDate: start,
			endDate: today,
			size: '5',
		});
		expect(screen.queryByTestId('staff-dashboard-reports-panel')).toBeNull();
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
			expect(screen.getByTestId('staff-dashboard-reports-panel')).toBeTruthy();
		});

		expect(warmed).toHaveLength(9);
		for (const query of warmed) {
			expect(query.getObserversCount()).toBeGreaterThan(0);
			expect(query.state.dataUpdatedAt).toBe(snapshot.get(query.queryKey));
		}
		expect(mocks.respond.mock.calls).toHaveLength(calls);
	});
});
