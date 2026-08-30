import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
	createMemoryHistory,
	createRootRoute,
	createRoute,
	createRouter,
	Outlet,
	RouterProvider,
	useLocation,
} from '@tanstack/react-router';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
/**
 * @vitest-environment jsdom
 */
/**
 * #851 — integration guard for the loader-driven breadcrumb trail.
 *
 * The unit half lives in `breadcrumbs.test.ts` (pure `deriveBreadcrumbTrail`
 * over projected matches). This file mounts a REAL router with the REAL
 * production route option objects and proves the #851 outcome end to end:
 *
 * 1. A cold deep link to `/staff/tenants/t1/profiles/p1` paints the FULL
 *    trail (root + both entity names) once its first settled frame lands,
 *    because the route's awaited loader warmed TanStack Query's cache before
 *    the shell rendered — no entity skeleton is ever painted.
 * 2. Without the loader (the pre-#851 shape), that same cold deep link DOES
 *    show entity SKELETONS while `EntityCrumb`'s own queries resolve —
 *    pinning exactly what the loader buys.
 *
 * What is real here: the production route's own `loader`,
 * `pendingComponent` and `staticData.crumbs` (read off `Route.options`),
 * the shell's trail derivation (`deriveBreadcrumbTrail` via `useMatches`),
 * `EntityCrumb`, and TanStack Query's cache shared across the loader and
 * the crumb queries. What is mocked: only the Kiota transport (the same
 * fake-client pattern as `breadcrumb-contract.test.tsx`) and react-i18next.
 */
import type { JSX } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { AppShell } from '~/components/app-shell/app-shell';
import { Route as ProfileDetailsRoute } from '~/routes/authed/staff/tenants/$tenantId/profiles/$profileId';

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

vi.mock('@org/shared-ts/lib/should-logout-for-failure', () => ({
	shouldLogoutForFailure: () => false,
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

const TENANT_PAYLOAD = {
	tenantId: 't1',
	name: 'Acme Corporation',
	maxUsers: 10,
	status: 'active',
};

const PROFILE_PAYLOAD = {
	profile: { id: 'p1', name: 'Approvers' },
};

const AppShellHost = (): JSX.Element => {
	const location = useLocation();

	return (
		<AppShell mode="authed" pathname={location.pathname}>
			<Outlet />
		</AppShell>
	);
};

/** Builds the throwaway-but-real router over a pathless layout hosting the
 * production route's options. `withLoader=false` strips the awaited loader —
 * the pre-#851 shape — for the contrast test. */
const buildRouter = (
	initialUrl: string,
	queryClient: QueryClient,
	options_: { withLoader: boolean },
) => {
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
		component: () => <div data-testid="section-body" />,
	});
	if (options_.withLoader) {
		indexOptions.loader = detailsOptions.loader;
	}
	const indexRoute = createRoute(
		widenOptions<Parameters<typeof createRoute>[0]>(indexOptions),
	);
	const routeTree = rootRoute.addChildren([
		layoutRoute.addChildren([indexRoute]),
	]);

	return createRouter(
		widenOptions<Parameters<typeof createRouter>[0]>({
			routeTree,
			history: createMemoryHistory({ initialEntries: [initialUrl] }),
			context: { queryClient },
		}),
	);
};

describe('breadcrumb-loader (#851 first-paint full trail)', () => {
	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
		mocks.respond.mockReset();
	});

	test('a cold deep link paints the full named trail with no entity skeleton ever rendered', async () => {
		mocks.respond.mockImplementation(async (call) => {
			if (pathEndsWith(call, 'byTenantId', 'get')) {
				return TENANT_PAYLOAD;
			}
			if (pathEndsWith(call, 'byProfileId', 'get')) {
				return PROFILE_PAYLOAD;
			}
			return {};
		});

		const queryClient = new QueryClient({
			defaultOptions: { queries: { retry: false, staleTime: 30_000 } },
		});

		render(
			<QueryClientProvider client={queryClient}>
				<RouterProvider
					router={buildRouter('/staff/tenants/t1/profiles/p1', queryClient, {
						withLoader: true,
					})}
				/>
			</QueryClientProvider>,
		);

		await waitFor(() => {
			expect(screen.getByTestId('section-body')).toBeTruthy();
		});

		const nav = screen.getByRole('navigation', { name: 'nav-breadcrumb' });

		expect(nav.textContent).toContain('nav-root-staff');
		expect(nav.textContent).toContain('nav-tenants');
		expect(nav.textContent).toContain('Acme Corporation');
		expect(nav.textContent).toContain('common:profiles');
		expect(nav.textContent).toContain('Approvers');
		expect(
			screen.queryByTestId('app-shell-breadcrumb-entity-skeleton'),
		).toBeNull();
	});

	test('without the awaited loader the same cold deep link shows entity skeletons first', async () => {
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

		const queryClient = new QueryClient({
			defaultOptions: { queries: { retry: false, staleTime: 30_000 } },
		});

		render(
			<QueryClientProvider client={queryClient}>
				<RouterProvider
					router={buildRouter('/staff/tenants/t1/profiles/p1', queryClient, {
						withLoader: false,
					})}
				/>
			</QueryClientProvider>,
		);

		await waitFor(() => {
			expect(
				screen.getAllByTestId('app-shell-breadcrumb-entity-skeleton').length,
			).toBeGreaterThan(0);
		});

		releaseProfileFetch?.();

		await waitFor(() => {
			expect(
				screen.queryByTestId('app-shell-breadcrumb-entity-skeleton'),
			).toBeNull();
		});
	});
});
