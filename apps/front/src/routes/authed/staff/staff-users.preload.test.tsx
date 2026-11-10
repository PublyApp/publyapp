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
import { Route as StaffUsersRoute } from '~/routes/authed/staff/staff-users';

/**
 * #2340 — the real staff-users route preloads its page list from the route's
 * own query spec.
 *
 * The loader never awaits: hovering the link runs it through the production
 * router's `defaultPreload: 'intent'`, and the factory warms the query cache
 * fire-and-forget. This spec mounts the REAL route options under a throwaway
 * router and counts the fake Kiota calls per endpoint:
 *
 * - hover fetches the page list exactly once;
 * - the click that follows paints the page from that cache with no additional
 *   fetch, and the page's own hook observes the warmed query.
 *
 * What is real: the production route's `loader`, `loaderDeps`,
 * `validateSearch` and page component, plus the real `lib/query` factories.
 * What is mocked: only the Kiota transport, react-i18next, and the logout
 * side effect.
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

const USERS_PATH = ['staff', 'users', 'get'] as const;
const LINK_LABEL = 'open staff users';

const destination = widenOptions<PreloadDestination>({
	linkTo: '/staff/staff-users',
	path: '/staff/staff-users',
	options: StaffUsersRoute.options,
});

describe('#2340 staff-users route preload', () => {
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
		expect(countCallsByPath(mocks.respond, ...USERS_PATH)).toBe(0);

		fireEvent.mouseEnter(link);

		await waitFor(() => {
			expect(countCallsByPath(mocks.respond, ...USERS_PATH)).toBe(1);
		});
		await waitFor(() => {
			expect(queryClient.isFetching()).toBe(0);
		});

		const warmed = preloadedQueries(queryClient);
		expect(warmed).toHaveLength(1);
		expect(warmed[0]?.state.data).toBeDefined();
		// Preloading never navigates: the destination page stays unmounted.
		expect(screen.queryByTestId('staff-users-table')).toBeNull();
	});

	test('clicking after the preload paints the page from cache with no refetch', async () => {
		const { queryClient } = renderPreloadScenario({
			destination,
			linkLabel: LINK_LABEL,
		});
		const link = await screen.findByRole('link', { name: LINK_LABEL });

		fireEvent.mouseEnter(link);
		await waitFor(() => {
			expect(countCallsByPath(mocks.respond, ...USERS_PATH)).toBe(1);
		});
		await waitFor(() => {
			expect(queryClient.isFetching()).toBe(0);
		});

		const warmed = preloadedQueries(queryClient);
		const snapshot = warmedSnapshot(warmed);

		fireEvent.click(link);

		await waitFor(() => {
			expect(screen.getByTestId('staff-users-table')).toBeTruthy();
		});

		for (const query of warmed) {
			// The page's own hook observes the very query the loader warmed…
			expect(query.getObserversCount()).toBeGreaterThan(0);
			// …and its fresh data was reused: no refetch on mount.
			expect(query.state.dataUpdatedAt).toBe(snapshot.get(query.queryKey));
		}
	});
});
