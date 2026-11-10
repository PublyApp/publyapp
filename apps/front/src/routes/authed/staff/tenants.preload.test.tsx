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
	warmedSnapshot,
	widenOptions,
} from '~/routes/authed/staff/_preload-test-harness';
import { Route as StaffTenantsRoute } from '~/routes/authed/staff/tenants';

/**
 * #2340 — the real staff tenants route preloads its page list from the route's
 * own query spec (see `staff-users.preload.test.tsx` for the harness
 * rationale). Hover warms the list once; the click paints it from cache.
 */
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

const TENANTS_PATH = ['staff', 'tenants', 'get'] as const;
const LINK_LABEL = 'open tenants';

const destination = widenOptions<PreloadDestination>({
	linkTo: '/staff/tenants',
	path: '/staff/tenants',
	options: StaffTenantsRoute.options,
});

describe('#2340 staff tenants route preload', () => {
	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
		mocks.respond.mockReset();
	});

	test('hovering the link warms the page list exactly once', async () => {
		const { queryClient } = renderPreloadScenario({
			destination,
			linkLabel: LINK_LABEL,
		});

		const link = await screen.findByRole('link', { name: LINK_LABEL });
		expect(countCallsByPath(mocks.respond, ...TENANTS_PATH)).toBe(0);

		fireEvent.mouseEnter(link);

		await waitFor(() => {
			expect(countCallsByPath(mocks.respond, ...TENANTS_PATH)).toBe(1);
		});
		await waitFor(() => {
			expect(queryClient.isFetching()).toBe(0);
		});

		const warmed = preloadedQueries(queryClient);
		expect(warmed).toHaveLength(1);
		expect(warmed[0]?.state.data).toBeDefined();
		expect(screen.queryByTestId('staff-tenants-table')).toBeNull();
	});

	test('clicking after the preload paints the page from cache with no refetch', async () => {
		const { queryClient } = renderPreloadScenario({
			destination,
			linkLabel: LINK_LABEL,
		});
		const link = await screen.findByRole('link', { name: LINK_LABEL });

		fireEvent.mouseEnter(link);
		await waitFor(() => {
			expect(countCallsByPath(mocks.respond, ...TENANTS_PATH)).toBe(1);
		});
		await waitFor(() => {
			expect(queryClient.isFetching()).toBe(0);
		});

		const warmed = preloadedQueries(queryClient);
		const snapshot = warmedSnapshot(warmed);

		fireEvent.click(link);

		await waitFor(() => {
			expect(screen.getByTestId('staff-tenants-table')).toBeTruthy();
		});

		for (const query of warmed) {
			expect(query.getObserversCount()).toBeGreaterThan(0);
			expect(query.state.dataUpdatedAt).toBe(snapshot.get(query.queryKey));
		}
	});
});
