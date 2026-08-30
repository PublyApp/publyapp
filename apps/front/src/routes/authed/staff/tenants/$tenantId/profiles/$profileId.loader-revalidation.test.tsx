/**
 * @vitest-environment jsdom
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
	createMemoryHistory,
	createRootRoute,
	createRoute,
	createRouter,
	Outlet,
	RouterProvider,
} from '@tanstack/react-router';
import { cleanup, render, waitFor } from '@testing-library/react';
/**
 * #851 round 3 (A3) — background revalidation guard on the real $profileId loader.
 *
 * The production route's loader does:
 *
 *   await Promise.all([query(tenant), query(profile)]);   // initial fetch
 *   query(tenant).catch(() => {});                         // background revalidation
 *   query(profile).catch(() => {});                        // background revalidation
 *
 * This spec mounts the REAL loader (read off `ProfileDetailsRoute.options` and
 * attached to a throwaway route) and counts fetcher invocations to prove the two
 * fire-and-forget `query()` calls actually trigger network requests. With
 * `staleTime: 0` (the default in the test QueryClient), cached data is immediately
 * stale, so each second `query()` on a key fires a background refetch — exactly
 * what `ensureQueryData` used to buy before the #851 migration.
 *
 * Deleting those two fire-and-forget `query()` calls must turn this test RED:
 * at least 2 fetch calls disappear (the background revalidation fetches). The
 * RED/GREEN proof is captured in `.dump/preuve-r3-loader.md`.
 *
 * What is real: the production route's `loader`, `pendingComponent`,
 * `errorComponent`, `staticData`, and page component. What is mocked: only the
 * Kiota transport, react-i18next, and the logout side effect.
 */
import type { JSX } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { AppShell } from '~/components/app-shell/app-shell';
import { Route as ProfileDetailsRoute } from '~/routes/authed/staff/tenants/$tenantId/profiles/$profileId';

const widenOptions = <T,>(value: unknown): T => value as T;

type FakeClientCall = { path: readonly string[]; args: readonly unknown[] };
type FakeResponse = Record<string, unknown>;

interface FakeApiClient {
	(): Promise<FakeResponse>;
	[segment: string]: FakeApiClient;
}

const mocks = vi.hoisted(() => {
	const HTTP_VERBS = new Set(['get', 'post', 'patch', 'delete', 'put']);

	const buildFakeApiClient = (
		respond: (call: FakeClientCall) => FakeResponse | Promise<FakeResponse>,
	): FakeApiClient => {
		const makeProxy = (path: readonly string[]): FakeApiClient =>
			new Proxy(() => {}, {
				get: (_target, prop) =>
					typeof prop === 'string' ? makeProxy([...path, prop]) : undefined,
				apply: (_target, _thisArg, args) => {
					const last = path[path.length - 1];
					if (last && HTTP_VERBS.has(last)) {
						return Promise.resolve(respond({ path, args }));
					}

					return makeProxy(path);
				},
			}) as FakeApiClient;

		return makeProxy([]);
	};

	const respond = vi.fn(
		(_call: FakeClientCall): FakeResponse | Promise<FakeResponse> => ({}),
	);
	const fakeClient = buildFakeApiClient((call) => respond(call));

	return { respond, fakeClient };
});

vi.mock('~/lib/api-client/client-manager', async () => {
	const actual = await vi.importActual<
		typeof import('~/lib/api-client/client-manager')
	>('~/lib/api-client/client-manager');

	return {
		...actual,
		getClientManager: () => ({
			getOrCreateClient: () => mocks.fakeClient,
			getOrCreateStaffClient: () => mocks.fakeClient,
			getOrCreateTenantScopeClient: () => mocks.fakeClient,
			getOrCreateAnonymousClient: () => mocks.fakeClient,
			getOrCreateSessionClient: () => mocks.fakeClient,
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

const pathEndsWith = (call: FakeClientCall, ...suffix: string[]): boolean => {
	const tail = call.path.slice(-suffix.length);
	return suffix.every((segment, index) => tail[index] === segment);
};

const TENANT_ID = 't1';
const PROFILE_ID = 'p1';
const DETAILS_URL = `/staff/tenants/${TENANT_ID}/profiles/${PROFILE_ID}`;

const TENANT_PAYLOAD = {
	tenantId: TENANT_ID,
	name: 'Acme Corporation',
	maxUsers: 10,
	status: 'active',
};

const PROFILE_PAYLOAD = {
	profile: { id: PROFILE_ID, name: 'Approvers' },
};

const AppShellHost = (): JSX.Element => (
	<AppShell mode="authed" pathname={DETAILS_URL}>
		<Outlet />
	</AppShell>
);

/** Counts how many times a given fetcher path suffix was invoked. */
const countByPath = (suffix: string[]): number =>
	mocks.respond.mock.calls.filter((callArgs) => {
		const call: FakeClientCall = callArgs[0] as FakeClientCall;
		return call && pathEndsWith(call, ...suffix);
	}).length;

/** Mounts the production route's REAL option objects under a throwaway router.
 * The QueryClient uses `staleTime: 0` (default) so cached data is immediately
 * stale, making the background-revalidation `query()` calls actually fire. */
const buildRouter = (queryClient: QueryClient) => {
	const rootRoute = createRootRoute({
		component: AppShellHost,
		staticData: { crumbs: 'shell' },
	});
	const layoutRoute = createRoute({
		getParentRoute: () => rootRoute,
		id: '/_profile-details-layout',
		staticData: ProfileDetailsRoute.options.staticData,
		component: () => <Outlet />,
	});
	const detailsOptions = widenOptions<
		Record<string, unknown> & { loader?: unknown }
	>(ProfileDetailsRoute.options);
	const indexOptions = widenOptions<
		Record<string, unknown> & { loader?: unknown }
	>({
		getParentRoute: () => layoutRoute,
		path: '/staff/tenants/$tenantId/profiles/$profileId',
		staticData: detailsOptions.staticData,
		validateSearch: detailsOptions.validateSearch,
		pendingComponent: detailsOptions.pendingComponent,
		errorComponent: detailsOptions.errorComponent,
		component: detailsOptions.component,
	});
	indexOptions.loader = detailsOptions.loader;
	const indexRoute = createRoute(
		widenOptions<Parameters<typeof createRoute>[0]>(indexOptions),
	);
	const routeTree = rootRoute.addChildren([
		layoutRoute.addChildren([indexRoute]),
	]);

	return createRouter(
		widenOptions<Parameters<typeof createRouter>[0]>({
			routeTree,
			history: createMemoryHistory({ initialEntries: [DETAILS_URL] }),
			context: { queryClient },
		}),
	);
};

describe('loader revalidation (#851 round 3 A3) — real $profileId loader', () => {
	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
		mocks.respond.mockReset();
	});

	test('the two background-revalidation query() calls each trigger an extra fetch beyond the initial fetch', async () => {
		mocks.respond.mockImplementation(async (call) => {
			if (pathEndsWith(call, 'byTenantId', 'get')) {
				return TENANT_PAYLOAD;
			}
			if (pathEndsWith(call, 'byProfileId', 'get')) {
				return PROFILE_PAYLOAD;
			}
			return {};
		});

		// staleTime: 0 (default) — data is immediately stale after the initial
		// await, so the fire-and-forget query() calls each trigger a background
		// refetch on top of the awaited initial fetch.
		const queryClient = new QueryClient({
			defaultOptions: { queries: { retry: false } },
		});

		render(
			<QueryClientProvider client={queryClient}>
				<RouterProvider router={buildRouter(queryClient)} />
			</QueryClientProvider>,
		);

		await waitFor(() => {
			expect(queryClient.isFetching()).toBe(0);
		});

		const tenantFetches = countByPath(['byTenantId', 'get']);
		const profileFetches = countByPath(['byProfileId', 'get']);

		// With the background-revalidation block present, each query fires at
		// least 2 times: 1 (awaited initial fetch) + 1 (background revalidation).
		// Without the block, each fires only 1 time (initial fetch alone).
		// The >= assertions make the test robust to component-level refetches
		// (which are environment-dependent) while still proving the revalidation
		// block fires: removing it collapses the count to exactly 1.
		expect(tenantFetches).toBeGreaterThanOrEqual(2);
		expect(profileFetches).toBeGreaterThanOrEqual(2);
	});
});
