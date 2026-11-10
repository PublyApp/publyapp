/**
 * @vitest-environment jsdom
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
	createMemoryHistory,
	createRootRoute,
	createRoute,
	createRouter,
	Link,
	Outlet,
	RouterProvider,
} from '@tanstack/react-router';
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from '@testing-library/react';
/**
 * #2340 — the real $roleId route preloads its five page queries from the one
 * spec in `$roleId/_queries.ts`.
 *
 * The loader no longer awaits: hovering the role link runs it through the
 * production router's `defaultPreload: 'intent'`, and the five factories warm
 * the query cache fire-and-forget. This spec mounts the REAL route options
 * under a throwaway router and counts the fake Kiota calls per endpoint:
 *
 * - hover fetches each of the five keys exactly once, and the route's
 *   `pendingComponent` never renders (nothing navigates);
 * - the click that follows paints the page body from that cache with zero
 *   additional fetches (the QueryClient uses the production 30 s default, so
 *   the page's own `useQuery` sees fresh data).
 *
 * What is real: the production route's `loader`, `pendingComponent`,
 * `errorComponent`, `staticData`, `validateSearch` and page component, plus
 * the real `lib/query` factories. What is mocked: only the Kiota transport,
 * react-i18next, and the logout side effect.
 */
import { afterEach, describe, expect, test, vi } from 'vitest';
import { Route as RoleDetailsRoute } from '~/routes/authed/staff/tenants/$tenantId/roles/$roleId';

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
const ROLE_ID = 'p1';
const ROLES_URL = `/staff/tenants/${TENANT_ID}/roles`;

const TENANT_PAYLOAD = {
	tenantId: TENANT_ID,
	name: 'Acme Corporation',
	maxUsers: 10,
	status: 'active',
};

const ROLE_PAYLOAD = {
	role: { id: ROLE_ID, name: 'Approvers' },
};

/** One suffix per query the page renders; each must be fetched exactly once
 * by the hover. */
const QUERY_PATHS = {
	tenantDetails: ['staff', 'tenants', 'byTenantId', 'get'],
	roleDetails: ['roles', 'byRoleId', 'get'],
	rolePermissionKeys: ['roles', 'byRoleId', 'permissions', 'get'],
	roleMembers: ['roles', 'byRoleId', 'users', 'get'],
	permissionCatalog: ['staff', 'permissions', 'scopes', 'tenant', 'get'],
} as const;

const countByPath = (suffix: readonly string[]): number =>
	mocks.respond.mock.calls.filter((callArgs) => {
		const call: FakeClientCall = callArgs[0] as FakeClientCall;
		return call && pathEndsWith(call, ...suffix);
	}).length;

const countAll = (): Record<string, number> =>
	Object.fromEntries(
		Object.entries(QUERY_PATHS).map(([name, suffix]) => [
			name,
			countByPath(suffix),
		]),
	);

/** Mounts the production route's REAL option objects under a throwaway
 * two-route tree: a roles list that links to the destination, and the
 * destination itself. `defaultPreload: 'intent'` +
 * `defaultPreloadStaleTime: 0` mirror the production router. */
const buildRouter = (queryClient: QueryClient) => {
	const rootRoute = createRootRoute({
		component: () => <Outlet />,
		staticData: { crumbs: 'shell' },
	});
	const rolesListRoute = createRoute(
		widenOptions<Parameters<typeof createRoute>[0]>({
			getParentRoute: () => rootRoute,
			path: '/staff/tenants/$tenantId/roles',
			staticData: { crumbs: 'shell' },
			component: () => (
				<div>
					<Link
						to="/staff/tenants/$tenantId/roles/$roleId"
						params={{ tenantId: TENANT_ID, roleId: ROLE_ID }}
					>
						open role
					</Link>
				</div>
			),
		}),
	);
	const layoutRoute = createRoute({
		getParentRoute: () => rootRoute,
		id: '/_role-details-layout',
		staticData: RoleDetailsRoute.options.staticData,
		component: () => <Outlet />,
	});
	const detailsOptions = widenOptions<
		Record<string, unknown> & { loader?: unknown }
	>(RoleDetailsRoute.options);
	const indexOptions = widenOptions<
		Record<string, unknown> & { loader?: unknown }
	>({
		getParentRoute: () => layoutRoute,
		path: '/staff/tenants/$tenantId/roles/$roleId',
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
		rolesListRoute,
		layoutRoute.addChildren([indexRoute]),
	]);

	return createRouter(
		widenOptions<Parameters<typeof createRouter>[0]>({
			routeTree,
			history: createMemoryHistory({ initialEntries: [ROLES_URL] }),
			// `locale` is what the root `beforeLoad` publishes to every route.
			context: { queryClient, locale: 'en' },
			defaultPreload: 'intent',
			defaultPreloadStaleTime: 0,
		}),
	);
};

const renderRoute = () => {
	// The production QueryClient default (`DEFAULT_QUERY_STALE_TIME_MS`,
	// router.tsx): preloaded data is fresh, so the page's own `useQuery` does
	// not refetch on mount.
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false, staleTime: 30_000 } },
	});

	render(
		<QueryClientProvider client={queryClient}>
			<RouterProvider router={buildRouter(queryClient)} />
		</QueryClientProvider>,
	);

	return { queryClient };
};

describe('#2340 $roleId route preload', () => {
	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
		mocks.respond.mockReset();
	});

	test('hovering the role link warms the five page queries once, without rendering the pending surface', async () => {
		mocks.respond.mockImplementation(async (call) => {
			if (pathEndsWith(call, ...QUERY_PATHS.tenantDetails)) {
				return TENANT_PAYLOAD;
			}
			if (pathEndsWith(call, ...QUERY_PATHS.roleDetails)) {
				return ROLE_PAYLOAD;
			}
			if (pathEndsWith(call, ...QUERY_PATHS.rolePermissionKeys)) {
				return { permissionKeys: [] };
			}
			if (pathEndsWith(call, ...QUERY_PATHS.roleMembers)) {
				return { users: [] };
			}
			if (pathEndsWith(call, ...QUERY_PATHS.permissionCatalog)) {
				return { additionalData: {} };
			}
			return {};
		});

		const { queryClient } = renderRoute();

		const link = await screen.findByRole('link', { name: 'open role' });
		expect(countAll()).toEqual({
			tenantDetails: 0,
			roleDetails: 0,
			rolePermissionKeys: 0,
			roleMembers: 0,
			permissionCatalog: 0,
		});

		fireEvent.mouseEnter(link);

		await waitFor(() => {
			expect(countAll()).toEqual({
				tenantDetails: 1,
				roleDetails: 1,
				rolePermissionKeys: 1,
				roleMembers: 1,
				permissionCatalog: 1,
			});
		});
		await waitFor(() => {
			expect(queryClient.isFetching()).toBe(0);
		});

		// Preloading never navigates: the destination's pending surface stays
		// unmounted, and the list is still what is on screen.
		expect(
			screen.queryByTestId('staff-tenant-role-details-loading'),
		).toBeNull();
		expect(screen.queryByTestId('staff-tenant-role-details-page')).toBeNull();
		expect(countAll()).toEqual({
			tenantDetails: 1,
			roleDetails: 1,
			rolePermissionKeys: 1,
			roleMembers: 1,
			permissionCatalog: 1,
		});
	});

	test('clicking after the preload paints the page from cache with zero additional fetches', async () => {
		mocks.respond.mockImplementation(async (call) => {
			if (pathEndsWith(call, ...QUERY_PATHS.tenantDetails)) {
				return TENANT_PAYLOAD;
			}
			if (pathEndsWith(call, ...QUERY_PATHS.roleDetails)) {
				return ROLE_PAYLOAD;
			}
			if (pathEndsWith(call, ...QUERY_PATHS.rolePermissionKeys)) {
				return { permissionKeys: [] };
			}
			if (pathEndsWith(call, ...QUERY_PATHS.roleMembers)) {
				return { users: [] };
			}
			if (pathEndsWith(call, ...QUERY_PATHS.permissionCatalog)) {
				return { additionalData: {} };
			}
			return {};
		});

		const { queryClient } = renderRoute();
		const link = await screen.findByRole('link', { name: 'open role' });

		fireEvent.mouseEnter(link);
		await waitFor(() => {
			expect(countByPath(QUERY_PATHS.tenantDetails)).toBe(1);
		});
		await waitFor(() => {
			expect(queryClient.isFetching()).toBe(0);
		});

		const afterPreload = countAll();

		fireEvent.click(link);

		await waitFor(() => {
			expect(screen.getByTestId('staff-tenant-role-details-page')).toBeTruthy();
		});
		await waitFor(() => {
			expect(queryClient.isFetching()).toBe(0);
		});

		expect(countAll()).toEqual(afterPreload);
	});
});
