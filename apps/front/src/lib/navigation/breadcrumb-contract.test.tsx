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
import type {
	VirtualRouteNode,
	VirtualRootRoute,
} from '@tanstack/virtual-file-routes';
/**
 * @vitest-environment jsdom
 */
/**
 * Tier 2 guard for #973 (the artifact guard, not a source-scan or a
 * synthetic fixture): walks the REAL generated route tree
 * (`~/routeTree.gen`) — the same tree the production `getRouter()` mounts —
 * and inspects the REAL `staticData.crumbs` declaration every route file
 * actually exports. It does not construct a fixture route tree and does not
 * regex-scan source.
 *
 * Two independent representations of "every registered route" must agree
 * (the vacuousness self-check both assertions below rely on): the virtual
 * route config (`~/routes.ts`, hand-authored, feeds the TanStack Start
 * route-generation plugin) and the generated `routeTree` (compiled from
 * that config, wired to the real route files). If the recursive walk below
 * ever silently visited zero routes — or stopped early — the counts would
 * diverge and the test would fail loudly, per the repo's standing objection
 * to guards that can't be proven to fail.
 */
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { AppShell } from '~/components/app-shell/app-shell';
import {
	selectStaffTenantCrumbName,
	staffTenantCrumbQuery,
} from '~/lib/query/staff-tenants';

import { routes } from '../../routes';
import { routeTree } from '../../routeTree.gen';
import type { CrumbSpec } from './breadcrumbs';

type StaticDataLike = {
	crumbs?: 'shell' | ((params: Record<string, string>) => readonly CrumbSpec[]);
};

type RouteLike = {
	id: string;
	fullPath: string;
	options?: { staticData?: StaticDataLike };
	children?: RouteLike[] | Record<string, RouteLike>;
};

/**
 * `route.children` is an array once the generated tree calls
 * `_addFileChildren`, but tolerate either shape defensively — this walk must
 * never silently stop just because of an unexpected container shape.
 */
const childRoutesOf = (route: RouteLike): RouteLike[] => {
	if (!route.children) {
		return [];
	}

	return Array.isArray(route.children)
		? route.children
		: Object.values(route.children);
};

const walkRealRouteTree = (
	route: RouteLike,
	visited: RouteLike[] = [],
): RouteLike[] => {
	visited.push(route);
	for (const child of childRoutesOf(route)) {
		walkRealRouteTree(child, visited);
	}

	return visited;
};

const countVirtualRouteNodes = (
	node: VirtualRouteNode | VirtualRootRoute,
): number => {
	const children = 'children' in node ? (node.children ?? []) : [];
	let total = 1;
	for (const child of children) {
		total += countVirtualRouteNodes(child);
	}

	return total;
};

/** Every `$param` segment in a route's real, generated full path. */
const dynamicSegmentsOf = (fullPath: string | undefined): string[] => {
	const matches = fullPath?.match(/\$[A-Za-z0-9_]+/g) ?? [];
	return matches.map((segment) => segment.slice(1));
};

/**
 * Frozen #972 legacy redirect stubs: `beforeLoad`-redirect-only components
 * that never render, so `'shell'` (no trail) is correct there even though
 * their path has a dynamic segment. This is the ONLY escape hatch the guard
 * below honors — anything else declaring `'shell'` on a dynamic route fails.
 */
const LEGACY_REDIRECT_STUB_PATHS = new Set([
	'/staff/tenants/$tenantId/profiles/new',
	'/staff/tenants/$tenantId/profiles/$profileId/edit',
	'/staff/tenants/$tenantId/users/invite',
]);

const buildSyntheticParams = (segments: string[]): Record<string, string> => {
	const params: Record<string, string> = {};
	for (const segment of segments) {
		params[segment] = `synthetic-${segment}`;
	}

	return params;
};

// `fullPath` is populated by the router's own tree-processing pass
// (`RouterCore.buildRouteTree`, run from `createRouter`), not eagerly by
// `routeTree.gen`'s `_addFileChildren`/`_addFileTypes` calls alone — building
// one throwaway real router (never rendered) forces that processing on the
// SAME shared `routeTree` object every test in this file walks.
createRouter({ routeTree, history: createMemoryHistory() } as never);

describe('breadcrumb contract — route-tree walk (#973 Tier 2, guard A)', () => {
	const allRoutes = walkRealRouteTree(routeTree as unknown as RouteLike);

	test('the walk is not vacuous: it visits as many routes as the virtual route config declares', () => {
		const expectedCount = countVirtualRouteNodes(routes);

		// Not `>=` — an exact match is the stronger, honest claim once both
		// sides genuinely represent the same tree; see the failing-first
		// evidence in the PR description for what "the walk silently visits
		// nothing" looks like against this assertion (it reports 1 vs. 45+).
		expect(allRoutes.length).toBe(expectedCount);
	});

	test('every route with a dynamic path segment names one entity per segment (or is an allowlisted legacy stub)', () => {
		const failures: string[] = [];
		let dynamicRouteCount = 0;

		for (const route of allRoutes) {
			const segments = dynamicSegmentsOf(route.fullPath);
			if (segments.length === 0) {
				continue;
			}

			dynamicRouteCount += 1;
			const crumbs = route.options?.staticData?.crumbs;

			if (LEGACY_REDIRECT_STUB_PATHS.has(route.fullPath)) {
				if (crumbs !== 'shell') {
					failures.push(
						`${route.fullPath}: allowlisted stub must declare 'shell', found ${typeof crumbs}`,
					);
				}
				continue;
			}

			if (crumbs === 'shell') {
				failures.push(
					`${route.fullPath}: a dynamic route used the 'shell' escape without being on the frozen legacy-stub allowlist`,
				);
				continue;
			}

			if (typeof crumbs !== 'function') {
				failures.push(
					`${route.fullPath}: staticData.crumbs is missing or not a function`,
				);
				continue;
			}

			const tail = crumbs(buildSyntheticParams(segments));
			const entityCount = tail.filter((spec) => spec.kind === 'entity').length;

			if (entityCount !== segments.length) {
				failures.push(
					`${route.fullPath}: expected ${segments.length} entity crumb(s) for [${segments.join(', ')}], found ${entityCount}`,
				);
			}
		}

		// Self-check: a walk that silently visited nothing would make this
		// loop a no-op and the assertion above vacuously true. The 44 route
		// files migrated for #973 include well over a dozen genuine dynamic
		// routes, so a near-zero count here is itself a failure signal.
		expect(dynamicRouteCount).toBeGreaterThan(10);
		expect(failures).toEqual([]);
	});
});

/**
 * Guard B — rendered-artifact test. Mounts the REAL `AppShell` component
 * (`~/components/app-shell/app-shell`, unmodified) and a REAL router — a
 * real `useMatches()`, a real `EntityCrumb`, a real `useQuery` — at a route
 * whose `staticData.crumbs` calls the SAME production
 * `staffTenantCrumbQuery`/`selectStaffTenantCrumbName` the tenant-detail
 * page itself declares (`routes/authed/staff/tenants/$tenantId.tsx`).
 *
 * The route TREE around it is a minimal throwaway root (the same pattern
 * `deep-link-canonicalization.test.tsx` and `__root-error-boundary.test.tsx`
 * already use in this repo: a synthetic root hosting real production
 * exports) rather than the full 44-route app — mounting the entire app
 * requires bootstrapping session/auth/surface-validation machinery
 * unrelated to breadcrumbs, and the crumb contract this guard exists to
 * prove lives entirely in `app-shell.tsx` + `entity-crumb.tsx` +
 * the route's own `staticData.crumbs`, all of which are real here. Only the
 * Kiota transport is mocked (network layer, not the router and not the
 * query hook) — `staffTenantDetailsQueryOptions.fetcher` still runs for
 * real, it just calls a fake client instead of making an HTTP request.
 */
type FakeClientCall = { path: readonly string[]; args: readonly unknown[] };

const mocks = vi.hoisted(() => {
	const HTTP_VERBS = new Set(['get', 'post', 'patch', 'delete', 'put']);

	/** A generic stand-in for the Kiota-generated `ApiClient`: every property
	 * access continues the method chain (`.staff.tenants.byTenantId(id)`),
	 * and calling a chain whose last segment is an HTTP verb resolves via
	 * `respond`. */
	const buildFakeApiClient = (
		respond: (call: FakeClientCall) => unknown,
	): unknown => {
		const makeProxy = (path: readonly string[]): unknown =>
			new Proxy(() => {}, {
				get: (_target, prop) =>
					typeof prop === 'string' ? makeProxy([...path, prop]) : undefined,
				apply: (_target, _thisArg, args) => {
					const last = path[path.length - 1];
					if (last && HTTP_VERBS.has(last)) {
						return Promise.resolve(respond({ path, args }));
					}

					// A non-verb call in the chain (e.g. `byTenantId(id)`) — stay
					// at the same logical position so `.get()` can follow.
					return makeProxy(path);
				},
			});

		return makeProxy([]);
	};

	const respond = vi.fn((_call: FakeClientCall): unknown => ({}));
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

const pathEndsWith = (call: FakeClientCall, ...suffix: string[]): boolean => {
	const tail = call.path.slice(-suffix.length);
	return suffix.every((segment, index) => tail[index] === segment);
};

const AppShellHost = () => {
	const location = useLocation();
	return (
		<AppShell mode="authed" pathname={location.pathname}>
			<div data-testid="page-body" />
		</AppShell>
	);
};

/** The tail this test declares is IDENTICAL in shape to the real
 * `/staff/tenants/$tenantId` route's own `staticData.crumbs` (same imports,
 * same query, same select) — see
 * `src/routes/authed/staff/tenants/$tenantId.tsx`. */
const buildTestRouter = (initialUrl: string, queryClient: QueryClient) => {
	const rootRoute = createRootRoute({
		component: AppShellHost,
		staticData: { crumbs: 'shell' },
	});
	const tenantRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: '/staff/tenants/$tenantId',
		staticData: {
			crumbs: (): readonly CrumbSpec[] => [
				{ kind: 'label', labelKey: 'nav-tenants', to: '/staff/tenants' },
				{
					kind: 'entity',
					query: staffTenantCrumbQuery,
					select: selectStaffTenantCrumbName,
				},
			],
		},
		component: () => <Outlet />,
	});
	const routeTreeForTest = rootRoute.addChildren([tenantRoute]);
	const history = createMemoryHistory({ initialEntries: [initialUrl] });

	return createRouter({
		routeTree: routeTreeForTest,
		history,
		context: { queryClient },
	} as never);
};

describe('breadcrumb contract — rendered artifact (#973 Tier 2, guard B)', () => {
	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
		mocks.respond.mockReset();
	});

	test('crumb count is final before the entity name resolves, then the name replaces the skeleton in place, with no jump', async () => {
		let releaseTenantFetch: (() => void) | undefined;
		const tenantFetchHeld = new Promise<void>((resolve) => {
			releaseTenantFetch = resolve;
		});

		mocks.respond.mockImplementation(async (call) => {
			if (pathEndsWith(call, 'byTenantId', 'get')) {
				await tenantFetchHeld;
				// `toStaffTenantDetails` reads `tenantId`, not `id` — this is the
				// real `GetTenantAsStaffResult` wire shape.
				return {
					tenantId: 'tenant-1',
					name: 'Acme Corporation',
					maxUsers: 10,
					status: 'active',
				};
			}

			return {};
		});

		const queryClient = new QueryClient({
			defaultOptions: { queries: { retry: false, staleTime: 30_000 } },
		});
		const router = buildTestRouter('/staff/tenants/tenant-1', queryClient);

		render(
			<QueryClientProvider client={queryClient}>
				<RouterProvider router={router} />
			</QueryClientProvider>,
		);

		const breadcrumbNav = await waitFor(() =>
			screen.getByRole('navigation', { name: 'nav-breadcrumb' }),
		);

		// (i) Crumb count is final while the entity name is still pending — it
		// comes from the route declaration (the URL), not from fetched data.
		await waitFor(() => {
			expect(
				breadcrumbNav.querySelector(
					'[data-testid="app-shell-breadcrumb-entity-skeleton"]',
				),
			).not.toBeNull();
		});
		const crumbCountWhilePending =
			breadcrumbNav.querySelectorAll(':scope > *').length;

		releaseTenantFetch?.();

		// (ii) The resolved name replaces the skeleton in place. Re-query the
		// nav fresh rather than reusing the earlier reference — irrelevant
		// re-renders elsewhere in the tree are allowed to replace the DOM
		// node; what must NOT happen is the crumb count changing (iv, below).
		await waitFor(() => {
			expect(
				screen.getByRole('navigation', { name: 'nav-breadcrumb' }).textContent,
			).toContain('Acme Corporation');
		});

		const settledNav = screen.getByRole('navigation', {
			name: 'nav-breadcrumb',
		});

		// (iv) — no crumb-count jump between the pending and resolved phases.
		expect(settledNav.querySelectorAll(':scope > *').length).toBe(
			crumbCountWhilePending,
		);
		expect(
			settledNav.querySelector(
				'[data-testid="app-shell-breadcrumb-entity-skeleton"]',
			),
		).toBeNull();
	});

	test('a failed entity lookup renders a muted dash, never an eternal skeleton, with the same crumb count', async () => {
		mocks.respond.mockImplementation((call) => {
			if (pathEndsWith(call, 'byTenantId', 'get')) {
				throw new Error('not found');
			}

			return {};
		});

		const queryClient = new QueryClient({
			defaultOptions: { queries: { retry: false, staleTime: 30_000 } },
		});
		const router = buildTestRouter(
			'/staff/tenants/missing-tenant',
			queryClient,
		);

		render(
			<QueryClientProvider client={queryClient}>
				<RouterProvider router={router} />
			</QueryClientProvider>,
		);

		const initialNav = await waitFor(() =>
			screen.getByRole('navigation', { name: 'nav-breadcrumb' }),
		);
		const crumbCountBeforeSettling =
			initialNav.querySelectorAll(':scope > *').length;

		await waitFor(() => {
			expect(
				screen
					.getByRole('navigation', { name: 'nav-breadcrumb' })
					.querySelector(
						'[data-testid="app-shell-breadcrumb-entity-fallback"]',
					),
			).not.toBeNull();
		});

		const settledNav = screen.getByRole('navigation', {
			name: 'nav-breadcrumb',
		});
		expect(
			settledNav.querySelector(
				'[data-testid="app-shell-breadcrumb-entity-skeleton"]',
			),
		).toBeNull();
		expect(settledNav.querySelectorAll(':scope > *').length).toBe(
			crumbCountBeforeSettling,
		);
	});
});
