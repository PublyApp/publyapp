import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
/**
 * @vitest-environment jsdom
 */
import {
	createMemoryHistory,
	createRootRoute,
	createRoute,
	createRouter,
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
 * #851 round 2 / #2340 — the role-detail route's API-failure surfaces.
 *
 * The loader no longer awaits (#2340): it preloads the page's queries
 * fire-and-forget and swallows their failures, so the PAGE BODY is what
 * classifies an API failure and renders the route's designed views. These
 * specs pin that contract against a router that mounts the production
 * route's real option objects:
 *
 * - 404 (or a malformed-id 400) → `MissingTenantRoleView`
 * - 403 → `View403`
 * - 500/network → `TenantRoleDetailsError` with a retry that re-runs the fetch
 * - 401 → `LogoutRedirect`
 * - 404/403/500 never log the user out, and the generic parent-layout
 *   surfaces (`view-404`) stay out of the picture.
 *
 * The blocking contract an awaited loader used to provide is gone by design:
 * navigation never waits for data (spec §4.2.2), and `$roleId.preload.test.tsx`
 * proves the hover warms the cache instead.
 *
 * What is real here: the production route's `loader`, `pendingComponent`,
 * `errorComponent`, `staticData.crumbs` and page component, the shell's trail
 * derivation via `EntityCrumb`, and TanStack Query's cache shared between the
 * loader's preload and the crumb/page queries. What is mocked: only the Kiota
 * transport (the same fake-client pattern as `breadcrumb-loader.test.tsx`),
 * react-i18next, and the logout side effect.
 */
import type { JSX } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { AppShell } from '~/components/app-shell/app-shell';
import { Route as RoleDetailsRoute } from '~/routes/authed/staff/tenants/$tenantId/roles/$roleId';

const widenOptions = <T,>(value: unknown): T => {
	return value as T;
};

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
	const logout = vi.fn();

	return { respond, fakeClient, logout };
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
	useLogout: () => ({ logout: mocks.logout }),
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
const DETAILS_URL = `/staff/tenants/${TENANT_ID}/roles/${ROLE_ID}`;

const TENANT_PAYLOAD = {
	tenantId: TENANT_ID,
	name: 'Acme Corporation',
	maxUsers: 10,
	status: 'active',
};

const ROLE_PAYLOAD = {
	role: { id: ROLE_ID, name: 'Approvers' },
};

/** The wire shape the Kiota problem pipeline throws for an API problem. */
const problemFor = (status: number) =>
	({
		status,
		title: `HTTP ${status}`,
		detail: `problem-${status}`,
		responseStatusCode: status,
	}) satisfies FakeResponse;

const AppShellHost = (): JSX.Element => (
	<AppShell mode="authed" pathname={DETAILS_URL}>
		<Outlet />
	</AppShell>
);

/** Mounts the production route's REAL option objects under a throwaway
 * router (the same harness as `breadcrumb-loader.test.tsx`). */
const buildRouter = (queryClient: QueryClient) => {
	const rootRoute = createRootRoute({
		component: AppShellHost,
		staticData: { crumbs: 'shell' },
	});
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
		layoutRoute.addChildren([indexRoute]),
	]);

	const router = createRouter(
		widenOptions<Parameters<typeof createRouter>[0]>({
			routeTree,
			history: createMemoryHistory({ initialEntries: [DETAILS_URL] }),
			context: { queryClient, locale: 'en' },
		}),
	);

	return { router, roleDetailsRouteId: indexRoute.id };
};

const renderRouteAtDetailsUrl = async (): Promise<{
	queryClient: QueryClient;
	router: ReturnType<typeof createRouter>;
}> => {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	const { router } = buildRouter(queryClient);

	render(
		<QueryClientProvider client={queryClient}>
			<RouterProvider router={router} />
		</QueryClientProvider>,
	);

	await waitFor(() => {
		expect(queryClient.isFetching()).toBe(0);
	});

	return { queryClient, router };
};

describe('role-details failure surfaces (#851 round 2 / #2340)', () => {
	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
		mocks.respond.mockReset();
		mocks.logout.mockClear();
	});

	test('a 404 API failure renders the tenant not-found view without logging out', async () => {
		mocks.respond.mockImplementation(async (call) => {
			if (pathEndsWith(call, 'byTenantId', 'get')) {
				throw problemFor(404);
			}
			if (pathEndsWith(call, 'byRoleId', 'get')) {
				return ROLE_PAYLOAD;
			}
			return {};
		});

		await renderRouteAtDetailsUrl();

		// The page body's own tenant error view classifies a 404 as "tenant not
		// found" (the role cannot exist under a missing tenant).
		expect(
			await screen.findByTestId('staff-tenant-details-not-found'),
		).toBeTruthy();
		expect(screen.queryByTestId('view-404')).toBeNull();
		expect(mocks.logout).not.toHaveBeenCalled();
	});

	test('a 403 API failure renders the route forbidden view without logging out', async () => {
		mocks.respond.mockImplementation(async (call) => {
			if (pathEndsWith(call, 'byRoleId', 'get')) {
				throw problemFor(403);
			}
			if (pathEndsWith(call, 'byTenantId', 'get')) {
				return TENANT_PAYLOAD;
			}
			return {};
		});

		await renderRouteAtDetailsUrl();

		expect(await screen.findByTestId('view-403')).toBeTruthy();
		expect(mocks.logout).not.toHaveBeenCalled();
	});

	test('a 500 API failure renders TenantRoleDetailsError with a retry that re-runs the fetch', async () => {
		let failRoleFetch = true;
		mocks.respond.mockImplementation(async (call) => {
			if (pathEndsWith(call, 'byRoleId', 'get')) {
				if (failRoleFetch) {
					throw problemFor(500);
				}

				return ROLE_PAYLOAD;
			}
			if (pathEndsWith(call, 'byTenantId', 'get')) {
				return TENANT_PAYLOAD;
			}
			return {};
		});

		await renderRouteAtDetailsUrl();

		expect(
			await screen.findByTestId('staff-tenant-role-details-error'),
		).toBeTruthy();
		expect(mocks.logout).not.toHaveBeenCalled();

		failRoleFetch = false;
		fireEvent.click(screen.getByRole('button', { name: /retry/i }));

		await waitFor(() => {
			expect(
				screen.queryByTestId('staff-tenant-role-details-error'),
			).toBeNull();
		});
		await waitFor(() => {
			expect(screen.getByTestId('staff-tenant-role-details-page')).toBeTruthy();
		});
		const nav = screen.getByRole('navigation', { name: 'nav-breadcrumb' });
		expect(nav.textContent).toContain('Acme Corporation');
		expect(nav.textContent).toContain('Approvers');
		expect(
			screen.queryByTestId('app-shell-breadcrumb-entity-skeleton'),
		).toBeNull();
	});

	// A3b / #2340: the 401 → logout chain must survive the awaited-loader →
	// fire-and-forget preload migration. The page body must route a 401 API
	// failure to LogoutRedirect — the repo-wide "only 401 logs out" invariant.
	test('a 401 API failure routes to LogoutRedirect (401→logout invariant preserved)', async () => {
		mocks.respond.mockImplementation(async (call) => {
			if (pathEndsWith(call, 'byTenantId', 'get')) {
				throw problemFor(401);
			}
			if (pathEndsWith(call, 'byRoleId', 'get')) {
				return ROLE_PAYLOAD;
			}
			return {};
		});

		await renderRouteAtDetailsUrl();

		// 401 must trigger logout, not render a not-found/forbidden/retry view
		expect(await screen.findByTestId('logout-redirect')).toBeTruthy();
		expect(
			screen.queryByTestId('staff-tenant-role-details-not-found'),
		).toBeNull();
		expect(screen.queryByTestId('view-403')).toBeNull();
		expect(screen.queryByTestId('staff-tenant-role-details-error')).toBeNull();
	});
});
