/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import {
	countCallsByPath,
	expectFilteredHoverClickReusesWarmedKeys,
	type FakeClientCall,
	type FakeResponse,
	type PreloadDestination,
	preloadedQueries,
	requestQueryParameters,
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

	test('a filtered URL warms the key the page reads for that URL', async () => {
		await expectFilteredHoverClickReusesWarmedKeys({
			destination: widenOptions<PreloadDestination>({
				...destination,
				linkSearch: { status: 'active' },
			}),
			linkLabel: LINK_LABEL,
			pageTestId: 'staff-users-table',
		});
	});

	test('the access-level filter reaches the API (whole collection, every page)', async () => {
		mocks.respond.mockImplementation(() => ({
			data: [
				{
					id: 'u1',
					email: 'a@example.com',
					firstName: 'A',
					lastName: 'B',
					roles: [],
					isFullAccess: true,
					status: 'active',
				},
			],
			nextCursor: null,
			totalCount: 20,
			counts: {
				total: 20,
				active: 20,
				suspended: 0,
				fullAccess: 2,
				standardAccess: 18,
			},
		}));
		renderPreloadScenario({
			destination: widenOptions<PreloadDestination>({
				...destination,
				linkSearch: { role: 'full_access' },
			}),
			linkLabel: LINK_LABEL,
		});
		fireEvent.click(await screen.findByRole('link', { name: LINK_LABEL }));
		await waitFor(() => {
			expect(screen.getByTestId('staff-users-table')).toBeTruthy();
		});

		const requests = requestQueryParameters(mocks.respond, ...USERS_PATH);
		// (The team overview also reads an unfiltered counter request.)
		expect(
			requests.some((parameters) => parameters.access === 'full_access'),
		).toBe(true);
	});
});
