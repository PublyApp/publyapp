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
 * #851 round 2 — loader-blocking and loader-failure integration guards.
 *
 * `breadcrumb-loader.test.tsx` proves the trail paints once the first
 * settled frame lands; its mock fetchers resolve immediately, so it cannot
 * distinguish an awaited loader from a fire-and-forget one. These specs pin
 * BOTH remaining contracts against a router that mounts the production
 * route's real option objects:
 *
 * 1. The awaited loader BLOCKS the first paint of the page body on a cold
 *    deep link: while a hand-held profile fetch is still pending, the route's
 *    own body (`staff-tenant-profile-details-page`) is absent (the router is
 *    still showing the pending surface); when the fetch is released, the body
 *    mounts with both entity names already in TanStack Query's cache — no
 *    breadcrumb entity skeleton is ever painted.
 * 2. A loader rejection keeps the failure ON this route: the route's own
 *    `errorComponent` reuses the route's existing error views (404 →
 *    `MissingTenantProfileView`, 403 → `View403`, 500/network →
 *    `TenantProfileDetailsError` + retry), classified by the same helper the
 *    page body uses; the user is never logged out for 404/403/500, and the
 *    generic parent-layout surfaces (`view-404`) stay out of the picture.
 *
 * What is real here: the production route's `loader`, `pendingComponent`,
 * `errorComponent`, `staticData.crumbs` and page component, the shell's trail
 * derivation via `EntityCrumb`, and TanStack Query's cache shared between the
 * loader's `ensureQueryData` and the crumb/page queries. What is mocked: only
 * the Kiota transport (the same fake-client pattern as
 * `breadcrumb-loader.test.tsx`), react-i18next, and the logout side effect.
 */
import type { JSX } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { AppShell } from '~/components/app-shell/app-shell';
import { Route as ProfileDetailsRoute } from '~/routes/authed/staff/tenants/$tenantId/profiles/$profileId';

function widenOptions<T>(value: unknown): T {
	return value as T;
}

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

const renderRouteAtDetailsUrl = async (): Promise<QueryClient> => {
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

	return queryClient;
};

describe('breadcrumb-loader (#851 round 2)', () => {
	const queryClientRef = { current: undefined as QueryClient | undefined };

	afterEach(() => {
		cleanup();
		queryClientRef.current?.clear();
		queryClientRef.current = undefined;
		vi.restoreAllMocks();
		mocks.respond.mockReset();
		mocks.logout.mockClear();
	});

	/**
	 * The blocking contract, discriminated from fire-and-forget: the mocked
	 * profile fetcher resolves ONLY when this test releases it by hand. Under
	 * the awaited loader, `ensureQueryData` keeps the router in its pending
	 * state — the shell paints (trail skeleton visible) but the route body
	 * never mounts before release; a fire-and-forget loader returns
	 * synchronously and the body mounts while the fetch is still pending.
	 * After release, the body's first settled frame finds both entity names
	 * already in TanStack Query's cache.
	 */
	test('a held profile fetch blocks the page body until release, then paints with both names cached', async () => {
		let releaseProfileFetch: (() => void) | undefined;
		const profileFetchHeld = new Promise<void>((resolve) => {
			releaseProfileFetch = resolve;
		});

		mocks.respond.mockImplementation(async (call) => {
			if (pathEndsWith(call, 'byTenantId', 'get')) {
				return TENANT_PAYLOAD;
			}
			if (pathEndsWith(call, 'byProfileId', 'get')) {
				await profileFetchHeld;

				return PROFILE_PAYLOAD;
			}
			return {};
		});

		render(
			<QueryClientProvider
				client={
					(queryClientRef.current ??= new QueryClient({
						defaultOptions: { queries: { retry: false } },
					}))
				}
			>
				<RouterProvider
					router={buildRouter(queryClientRef.current as QueryClient)}
				/>
			</QueryClientProvider>,
		);

		// While the loader's awaited fetch is still pending the shell is live
		// (trail painted, the held profile crumb still a skeleton) but the
		// route body must NOT be mounted — the router sits on its pending
		// surface instead.
		await waitFor(() => {
			expect(
				screen.getAllByTestId('app-shell-breadcrumb-entity-skeleton').length,
			).toBeGreaterThan(0);
		});
		expect(
			screen.queryByTestId('staff-tenant-profile-details-page'),
		).toBeNull();

		releaseProfileFetch?.();

		await waitFor(() => {
			expect(
				screen.getByTestId('staff-tenant-profile-details-page'),
			).toBeTruthy();
		});

		// At the moment the body first appears, both entity names are already
		// in the cache the loader warmed, so no entity skeleton ever rendered.
		const nav = screen.getByRole('navigation', { name: 'nav-breadcrumb' });

		expect(nav.textContent).toContain('Acme Corporation');
		expect(nav.textContent).toContain('Approvers');
		expect(
			screen.queryByTestId('app-shell-breadcrumb-entity-skeleton'),
		).toBeNull();
	});

	test('a 404 loader rejection renders the route MissingTenantProfileView without logging out', async () => {
		mocks.respond.mockImplementation(async (call) => {
			if (pathEndsWith(call, 'byTenantId', 'get')) {
				throw problemFor(404);
			}
			if (pathEndsWith(call, 'byProfileId', 'get')) {
				return PROFILE_PAYLOAD;
			}
			return {};
		});

		await renderRouteAtDetailsUrl();

		expect(
			screen.getByTestId('staff-tenant-profile-details-not-found'),
		).toBeTruthy();
		expect(screen.queryByTestId('view-404')).toBeNull();
		expect(mocks.logout).not.toHaveBeenCalled();
	});

	test('a 403 loader rejection renders the route forbidden view without logging out', async () => {
		mocks.respond.mockImplementation(async (call) => {
			if (pathEndsWith(call, 'byProfileId', 'get')) {
				throw problemFor(403);
			}
			if (pathEndsWith(call, 'byTenantId', 'get')) {
				return TENANT_PAYLOAD;
			}
			return {};
		});

		await renderRouteAtDetailsUrl();

		expect(screen.getByTestId('view-403')).toBeTruthy();
		expect(mocks.logout).not.toHaveBeenCalled();
	});

	test('a 500 loader rejection renders TenantProfileDetailsError with a retry that re-runs the fetch', async () => {
		let failProfileFetch = true;
		mocks.respond.mockImplementation(async (call) => {
			if (pathEndsWith(call, 'byProfileId', 'get')) {
				if (failProfileFetch) {
					throw problemFor(500);
				}

				return PROFILE_PAYLOAD;
			}
			if (pathEndsWith(call, 'byTenantId', 'get')) {
				return TENANT_PAYLOAD;
			}
			return {};
		});

		await renderRouteAtDetailsUrl();

		expect(
			screen.getByTestId('staff-tenant-profile-details-error'),
		).toBeTruthy();
		expect(mocks.logout).not.toHaveBeenCalled();

		failProfileFetch = false;
		fireEvent.click(screen.getByRole('button', { name: 'try-again' }));

		await waitFor(() => {
			expect(
				screen.queryByTestId('staff-tenant-profile-details-error'),
			).toBeNull();
		});
		await waitFor(() => {
			expect(
				screen.getByTestId('staff-tenant-profile-details-page'),
			).toBeTruthy();
		});
		const nav = screen.getByRole('navigation', { name: 'nav-breadcrumb' });
		expect(nav.textContent).toContain('Acme Corporation');
		expect(nav.textContent).toContain('Approvers');
		expect(
			screen.queryByTestId('app-shell-breadcrumb-entity-skeleton'),
		).toBeNull();
	});
});
