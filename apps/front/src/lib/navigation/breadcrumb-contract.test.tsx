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
 *
 * #973 BLOCKER fix: counting `kind: 'entity'` specs per dynamic segment
 * (below) proves a route DECLARES an entity crumb but never proved the
 * crumb's `select` returns the entity's name rather than a constant — a
 * real tenant-route selector rewritten to always return `'Tenant detail'`
 * (the owner's exact rejected wording) passed every gate here. The
 * "resolves the representative payload's own name field" test further down
 * closes that gap: it drives each real route's own `select` closure against
 * a representative wire-shaped payload and requires the output to echo a
 * caller-supplied marker, so a selector that ignores its input and returns
 * anything fixed fails immediately, for every dynamic route, not just one.
 */
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { AppShell } from '~/components/app-shell/app-shell';
import { staffAuditLogCrumbQuery } from '~/lib/query/staff-audit-logs';
import { globalTenantUserCrumbQuery } from '~/lib/query/staff-global-tenant-users';
import { staffInvitationCrumbQuery } from '~/lib/query/staff-invitations';
import { staffProfileCrumbQuery } from '~/lib/query/staff-profiles';
import { staffTenantProfileCrumbQuery } from '~/lib/query/staff-tenant-profiles';
import { staffTenantUserCrumbQuery } from '~/lib/query/staff-tenant-users';
import { staffTenantCrumbQuery } from '~/lib/query/staff-tenants';
import { staffUserCrumbQuery } from '~/lib/query/staff-users';
import { tenantPostCrumbQuery } from '~/lib/query/tenant-posts';
import { Route as TenantDetailsRoute } from '~/routes/authed/staff/tenants/$tenantId';
import { Route as TenantProfileDetailsRoute } from '~/routes/authed/staff/tenants/$tenantId/profiles/$profileId';
import { Route as TenantProfileOverviewRoute } from '~/routes/authed/staff/tenants/$tenantId/profiles/$profileId/index';
import { Route as TenantProfileMembersRoute } from '~/routes/authed/staff/tenants/$tenantId/profiles/$profileId/members';
import { Route as TenantProfilePermissionsRoute } from '~/routes/authed/staff/tenants/$tenantId/profiles/$profileId/permissions';

import { routes } from '../../routes';
import { routeTree } from '../../routeTree.gen';
import type { CrumbSpec, EntityCrumbQuery } from './breadcrumbs';

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

	if (Array.isArray(route.children)) {
		return route.children;
	}
	return Object.values(route.children);
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

const isEntitySpec = (
	spec: CrumbSpec,
): spec is Extract<CrumbSpec, { kind: 'entity' }> => spec.kind === 'entity';

/**
 * Frozen #972 legacy redirect stubs: `beforeLoad`-redirect-only components
 * that never render, so `'shell'` (no trail) is correct there even though
 * their path has a dynamic segment. This is the ONLY escape hatch the guard
 * below honors — anything else declaring `'shell'` on a dynamic route fails.
 */
const LEGACY_REDIRECT_STUB_PATHS = new Set([
	'/staff/tenant-users/details/$userId',
	'/staff/tenant-users/details/$userId/$tab',
	'/staff/tenants/$tenantId/profiles/new',
	'/staff/tenants/$tenantId/profiles/$profileId/edit',
	'/staff/tenants/$tenantId/users/invite',
]);

const buildSyntheticParams = (segments: string[]) =>
	Object.fromEntries(
		segments.map((segment) => [segment, `synthetic-${segment}`]),
	);

/**
 * #973 BLOCKER remediation: counting `kind: 'entity'` specs (the test above)
 * proves a route DECLARES an entity crumb, but proved nothing about what the
 * crumb's `select` actually RETURNS — the reviewer changed the real tenant
 * route's `select` to `(data) => selectStaffTenantCrumbName(data) ? 'Tenant
 * detail' : undefined` and every existing gate still passed.
 *
 * This is a closed registry of the production `query` functions every real
 * `kind: 'entity'` crumb in the app is built from today (verified by the
 * grep-backed inventory in the PR review). Each entry pairs that exact
 * function reference — the SAME export a route file imports, not a re-typed
 * copy — with a representative wire-shaped payload whose name-bearing field
 * is filled with a caller-supplied marker. A route whose `query` isn't one of
 * these fails closed (`entry` below is `undefined`) rather than silently
 * skipping an unrecognized entity type; adding a genuinely new entity kind
 * means adding it here, with its own representative payload, on purpose.
 */
type EntityRegistryEntry = {
	query: (params: Record<string, string>) => EntityCrumbQuery;
	buildPayload: (marker: string) => Record<string, unknown>;
};

const ENTITY_QUERY_REGISTRY: readonly EntityRegistryEntry[] = [
	{
		query: staffTenantCrumbQuery,
		buildPayload: (marker) => ({ tenantId: 'probe-tenant-id', name: marker }),
	},
	{
		query: staffProfileCrumbQuery,
		buildPayload: (marker) => ({
			profile: { id: 'probe-profile-id', name: marker },
		}),
	},
	{
		query: staffUserCrumbQuery,
		buildPayload: (marker) => ({
			id: 'probe-user-id',
			email: marker,
			firstName: null,
			lastName: null,
		}),
	},
	{
		query: staffInvitationCrumbQuery,
		buildPayload: (marker) => ({ email: marker }),
	},
	{
		query: staffAuditLogCrumbQuery,
		buildPayload: (marker) => ({
			id: 'probe-audit-log-id',
			action: marker,
			userName: null,
			userEmail: null,
		}),
	},
	{
		query: staffTenantUserCrumbQuery,
		buildPayload: (marker) => ({
			id: 'probe-tenant-user-id',
			email: marker,
			firstName: null,
			lastName: null,
		}),
	},
	{
		query: staffTenantProfileCrumbQuery,
		buildPayload: (marker) => ({
			profile: { id: 'probe-tenant-profile-id', name: marker },
		}),
	},
	{
		query: globalTenantUserCrumbQuery,
		buildPayload: (marker) => ({
			id: 'probe-global-tenant-user-id',
			email: marker,
			firstName: null,
			lastName: null,
			displayName: marker,
		}),
	},
	{
		query: tenantPostCrumbQuery,
		buildPayload: (marker) => ({
			id: 'probe-post-id',
			body: marker,
		}),
	},
];

const widenOptions = <T,>(value: unknown): T => {
	return value as T;
};

// `fullPath` is populated by the router's own tree-processing pass
// (`RouterCore.buildRouteTree`, run from `createRouter`), not eagerly by
// `routeTree.gen`'s `_addFileChildren`/`_addFileTypes` calls alone — building
// one throwaway real router (never rendered) forces that processing on the
// SAME shared `routeTree` object every test in this file walks.
createRouter(
	widenOptions<Parameters<typeof createRouter>[0]>({
		routeTree,
		history: createMemoryHistory(),
	}),
);

describe('breadcrumb contract — route-tree walk (#973 Tier 2, guard A)', () => {
	const allRoutes = walkRealRouteTree(routeTree as RouteLike);

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

	/**
	 * #973 BLOCKER regression guard. The test above proves every dynamic
	 * segment has an object tagged `kind: 'entity'` — it never proves that
	 * object's `select` returns the entity's actual name rather than a
	 * constant. This test drives the REAL `select` function attached to every
	 * real entity crumb — the exact closure the route file exports, not a
	 * stand-in — against a representative wire-shaped payload whose
	 * name-bearing field is a per-crumb marker unrelated to any hardcoded
	 * English wording, then asserts the selector's output IS that marker.
	 *
	 * A selector that ignores its argument and returns a fixed string (the
	 * reviewer's `'Tenant detail'` escape, or any other constant) fails this
	 * immediately: the marker never appears in a hardcoded string, so the
	 * equality check misses. A selector that genuinely forwards the payload's
	 * name field passes for any marker, proving it is not hardcoded.
	 */
	test("every entity crumb's selector resolves the representative payload's own name field, not a constant (#973 BLOCKER regression guard)", () => {
		const failures: string[] = [];
		let entityCrumbCount = 0;

		for (const route of allRoutes) {
			const segments = dynamicSegmentsOf(route.fullPath);
			if (
				segments.length === 0 ||
				LEGACY_REDIRECT_STUB_PATHS.has(route.fullPath)
			) {
				continue;
			}

			const crumbs = route.options?.staticData?.crumbs;
			if (typeof crumbs !== 'function') {
				continue;
			}

			const tail = crumbs(buildSyntheticParams(segments));
			const entitySpecs = tail.filter(
				(spec): spec is Extract<CrumbSpec, { kind: 'entity' }> =>
					spec.kind === 'entity',
			);

			for (const [specIndex, spec] of entitySpecs.entries()) {
				entityCrumbCount += 1;
				const registryEntry = ENTITY_QUERY_REGISTRY.find(
					(entry) => entry.query === spec.query,
				);

				if (!registryEntry) {
					failures.push(
						`${route.fullPath}: entity crumb #${specIndex}'s query is not one of the vetted ENTITY_QUERY_REGISTRY entries — register a representative payload before trusting it`,
					);
					continue;
				}

				const marker = `entity-name-probe--${route.fullPath}--${specIndex}`;
				const resolved = spec.select(registryEntry.buildPayload(marker));

				if (resolved !== marker) {
					failures.push(
						`${route.fullPath}: entity crumb #${specIndex}'s selector did not echo the representative payload's name field (expected ${JSON.stringify(marker)}, got ${JSON.stringify(resolved)}) — it may return a constant instead of the entity's real name`,
					);
				}
			}
		}

		// Self-check, same rationale as the sibling test above: the #973
		// migration's 21 dynamic routes carry well over a dozen entity crumbs
		// between them, so a near-zero count here means this loop silently
		// found nothing rather than everything being correct.
		expect(entityCrumbCount).toBeGreaterThan(10);
		expect(failures).toEqual([]);
	});

	/**
	 * #973 BLOCKER, round 3: the PR review proved the two tests above are
	 * still not enough. `ENTITY_QUERY_REGISTRY` proves a crumb's `query` is
	 * SOME vetted production query and that its `select` echoes THAT query's
	 * own payload marker — it never proves the query is the one belonging to
	 * THIS crumb's own `$param`. The reviewer rewired the real
	 * `/staff/tenants/$tenantId/profiles/$profileId` route's profile crumb to
	 * `query: staffTenantCrumbQuery, select: selectStaffTenantCrumbName` (the
	 * TENANT'S already-registered pair) and every gate above stayed green:
	 * the query is registered, and the selector echoes ITS OWN payload's
	 * marker just fine — the tests simply never asked "does this crumb's
	 * query actually depend on the segment it claims to name."
	 *
	 * This test asks exactly that, behaviorally, against the real `query`
	 * closures — no hand-maintained "which param does each query belong to"
	 * side table, which would itself just be a second, independently-
	 * driftable model of the same fact the #973 saga keeps re-discovering.
	 * For every entity crumb at position `i` (aligned with the route's `i`-th
	 * `$param`, left to right — verified true of every one of this repo's
	 * entity-crumb-bearing route files today: the entity crumbs in a tail
	 * always appear in the same left-to-right order as the route's own
	 * dynamic segments; `conventions.md` now states this explicitly):
	 *
	 * (a) Sensitivity — changing ONLY that crumb's own segment (holding every
	 *     other segment fixed) MUST change the query's resolved `queryKey`.
	 *     A crumb whose query ignores its own segment (the reviewer's exact
	 *     mutation: the profile crumb's query only reads `tenantId`) fails
	 *     here, because the profile crumb's cache key stays byte-identical
	 *     whether `profileId` is `synthetic-profileId` or anything else.
	 * (b) Descendant independence — changing ONLY a DEEPER segment (one that
	 *     belongs to a crumb further right, e.g. `profileId` relative to the
	 *     shallower `tenantId` crumb) must NOT change an earlier crumb's
	 *     `queryKey`. This is the mirror-image bug the reviewer didn't need
	 *     to demonstrate to be real: a shallow crumb secretly resolving a
	 *     deeper/more specific entity. Ancestor scoping (a profile crumb
	 *     legitimately depending on its own tenant's `tenantId`) is NOT
	 *     penalized — only forward/descendant leakage is.
	 */
	test("every entity crumb's query is bound to ITS OWN dynamic segment, not a sibling's (#973 BLOCKER, round 3: registered-but-wrong-entity regression guard)", () => {
		const failures: string[] = [];
		let entityCrumbCount = 0;

		const queryKeyOf = (
			spec: Extract<CrumbSpec, { kind: 'entity' }>,
			params: Record<string, string>,
		): string => JSON.stringify(spec.query(params).queryKey);

		for (const route of allRoutes) {
			const segments = dynamicSegmentsOf(route.fullPath);
			if (
				segments.length === 0 ||
				LEGACY_REDIRECT_STUB_PATHS.has(route.fullPath)
			) {
				continue;
			}

			const crumbs = route.options?.staticData?.crumbs;
			if (typeof crumbs !== 'function') {
				continue;
			}

			const baseParams = buildSyntheticParams(segments);
			const baseEntitySpecs = crumbs(baseParams).filter(isEntitySpec);

			for (const [specIndex, ownSegment] of segments.entries()) {
				const baseSpec = baseEntitySpecs[specIndex];
				if (!baseSpec) {
					// Already reported by the structural entity-count test above.
					continue;
				}

				entityCrumbCount += 1;
				const baseKey = queryKeyOf(baseSpec, baseParams);

				// (a) Sensitivity to its own segment.
				const ownMutatedParams = {
					...baseParams,
					[ownSegment]: `mutated-${ownSegment}`,
				};
				const ownMutatedSpec =
					crumbs(ownMutatedParams).filter(isEntitySpec)[specIndex];
				const ownMutatedKey = ownMutatedSpec
					? queryKeyOf(ownMutatedSpec, ownMutatedParams)
					: undefined;

				if (baseKey === ownMutatedKey) {
					failures.push(
						`${route.fullPath}: entity crumb #${specIndex} is supposed to name $${ownSegment}, but changing ONLY $${ownSegment} left its query's cache key unchanged (${baseKey}) — its query does not depend on its own segment, so it may be resolving a sibling crumb's entity instead`,
					);
				}

				// (b) Independence from deeper (descendant) segments.
				for (
					let descendantIndex = specIndex + 1;
					descendantIndex < segments.length;
					descendantIndex += 1
				) {
					const descendantSegment = segments[descendantIndex];
					if (!descendantSegment) {
						continue;
					}

					const descendantMutatedParams = {
						...baseParams,
						[descendantSegment]: `mutated-${descendantSegment}`,
					};
					const descendantMutatedSpec = crumbs(descendantMutatedParams).filter(
						isEntitySpec,
					)[specIndex];
					const descendantMutatedKey = descendantMutatedSpec
						? queryKeyOf(descendantMutatedSpec, descendantMutatedParams)
						: undefined;

					if (baseKey !== descendantMutatedKey) {
						failures.push(
							`${route.fullPath}: entity crumb #${specIndex} (names $${ownSegment}) changed its cache key when only the DEEPER segment $${descendantSegment} changed — it may be resolving a more specific descendant entity instead of its own`,
						);
					}
				}
			}
		}

		// Self-check, same rationale as the sibling tests above.
		expect(entityCrumbCount).toBeGreaterThan(10);
		expect(failures).toEqual([]);
	});
});

/**
 * Guard B — rendered-artifact test. Mounts the REAL `AppShell` component
 * (`~/components/app-shell/app-shell`, unmodified) and a REAL router — a
 * real `useMatches()`, a real `EntityCrumb`, a real `useQuery` — at a route
 * whose `staticData` is read directly off the real production
 * `/staff/tenants/$tenantId` route module (`Route.options.staticData`, see
 * `TenantDetailsRoute` below), so the SAME `staffTenantCrumbQuery`/
 * `selectStaffTenantCrumbName` pair the tenant-detail page itself declares is
 * exercised here — not a re-typed copy of it.
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

/** Whatever the fake Kiota chain resolves to — tests read it back through
 * `respond` mock assertions, never by consuming the value itself. */
type FakeResponse = Record<string, unknown>;

/** One link in the fake Kiota method chain — a callable Proxy whose
 * properties continue the chain and whose call resolves an HTTP verb
 * segment. Declared as an interface because the index signature points
 * back at the same type (a self-referencing type alias is circular). */
interface FakeApiClient {
	(): Promise<FakeResponse>;
	[segment: string]: FakeApiClient;
}

const mocks = vi.hoisted(() => {
	const HTTP_VERBS = new Set(['get', 'post', 'patch', 'delete', 'put']);

	/** A generic stand-in for the Kiota-generated `ApiClient`: every property
	 * access continues the method chain (`.staff.tenants.byTenantId(id)`),
	 * and calling a chain whose last segment is an HTTP verb resolves via
	 * `respond`. */

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

					// A non-verb call in the chain (e.g. `byTenantId(id)`) — stay
					// at the same logical position so `.get()` can follow.
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

/**
 * #973 BLOCKER remediation: this used to re-declare a crumb tail here
 * (`kind: 'entity', query: staffTenantCrumbQuery, select:
 * selectStaffTenantCrumbName`) that merely COPIED the production route's
 * intended shape. A copy is independent of the real route by construction —
 * the reviewer mutated the real `/staff/tenants/$tenantId` route's `select`
 * to always return `'Tenant detail'` and this test's copy never noticed,
 * because it never read the mutated route at all.
 *
 * `staticData` is now taken directly off the imported production `Route`
 * object (`TenantDetailsRoute.options.staticData`,
 * `src/routes/authed/staff/tenants/$tenantId.tsx`) — the exact same pattern
 * `deep-link-canonicalization.test.tsx`'s `asValidateSearch` already
 * establishes for `validateSearch` in this repo (read the real option off
 * the real route module, mount it on a synthetic tree, never re-type it). A
 * regression in the real route's `crumbs` — including the exact
 * generic-label mutation above — now reaches this rendered test directly.
 */
const buildTestRouter = (initialUrl: string, queryClient: QueryClient) => {
	const rootRoute = createRootRoute({
		component: AppShellHost,
		staticData: { crumbs: 'shell' },
	});
	const tenantRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: '/staff/tenants/$tenantId',
		staticData: TenantDetailsRoute.options.staticData,
		component: () => <Outlet />,
	});
	const routeTreeForTest = rootRoute.addChildren([tenantRoute]);
	const history = createMemoryHistory({ initialEntries: [initialUrl] });

	return createRouter(
		widenOptions<Parameters<typeof createRouter>[0]>({
			routeTree: routeTreeForTest,
			history,
			context: { queryClient },
		}),
	);
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

	/**
	 * #973 IMPORTANT remediation: production `EntityCrumb` used to render the
	 * resolved name as a bare text fragment — no `truncate`, no `max-w-*`, no
	 * `title`. A tenant/profile/user with a long real name (exactly what this
	 * PR introduces — breadcrumbs now show real, user-supplied entity names)
	 * had nothing stopping it from overflowing or widening the breadcrumb
	 * row. This test drives the real `/staff/tenants/$tenantId` route's real
	 * `EntityCrumb` render with a long name and checks the production node.
	 *
	 * Real pixel geometry is NOT measurable here, and this is not glossed
	 * over: this file's `@vitest-environment jsdom` directive means no
	 * layout or paint ever runs — `getBoundingClientRect`, `scrollWidth`, and
	 * `clientWidth` are all 0 in jsdom regardless of CSS, and no compiled
	 * Tailwind stylesheet is loaded into this document, so there is no way to
	 * observe `text-overflow: ellipsis` actually clipping a glyph, or to
	 * measure whether the row's rendered width ever exceeded its container.
	 * That is a real browser's job — the front Playwright e2e suite
	 * (`apps/front/e2e/`) is the durable place for a genuine layout
	 * assertion; none exists there for this yet, and none is added by this
	 * change (out of scope for a IMPORTANT-severity gap in an already-large
	 * branch, and the repo's e2e suite requires the full docker stack).
	 *
	 * What IS real and checkable in this environment, against the actual
	 * production node (not a copy): (1) the full untruncated name is still
	 * recoverable — the `title` attribute, the conventional hover/assistive-
	 * technology minimum this repo already uses for every other long
	 * user-supplied string in constrained space (list-row cells, the tenant
	 * band); (2) the real truncation-establishing utility classes
	 * (`block truncate`, which Tailwind compiles to
	 * `overflow: hidden; text-overflow: ellipsis; white-space: nowrap`) are
	 * present on the real rendered node; (3) a long name produces the exact
	 * same DOM shape (same classes, same crumb count) as a short name — no
	 * conditional extra markup, no length-triggered wrap, no reserved empty
	 * space for the short case.
	 */
	test('a long entity name exposes its full value via title and carries the real truncation classes, with no DOM-shape difference from a short name (#973 IMPORTANT: long-name durability)', async () => {
		const longName =
			'Acme Corporation International Holdings & Subsidiaries Consolidated Group Worldwide Ltd.';

		mocks.respond.mockImplementation(async (call) => {
			if (pathEndsWith(call, 'byTenantId', 'get')) {
				return {
					tenantId: 'tenant-1',
					name: longName,
					maxUsers: 10,
					status: 'active',
				};
			}

			return {};
		});

		const longQueryClient = new QueryClient({
			defaultOptions: { queries: { retry: false, staleTime: 30_000 } },
		});
		const longRouter = buildTestRouter(
			'/staff/tenants/tenant-1',
			longQueryClient,
		);

		render(
			<QueryClientProvider client={longQueryClient}>
				<RouterProvider router={longRouter} />
			</QueryClientProvider>,
		);

		const longNameNode = await waitFor(() => {
			const node = screen.getByTestId('app-shell-breadcrumb-entity-name');
			expect(node.textContent).toBe(longName);
			return node;
		});

		// The a11y/hover minimum: the FULL value must be recoverable even
		// though the visible text is meant to be clipped.
		expect(longNameNode.getAttribute('title')).toBe(longName);

		// The real classes Tailwind compiles into the actual clipping CSS,
		// present on the real production node.
		const longNameClasses = longNameNode.className.split(' ');
		expect(longNameClasses).toEqual(
			expect.arrayContaining(['block', 'truncate']),
		);

		const navWithLongName = screen.getByRole('navigation', {
			name: 'nav-breadcrumb',
		});
		const crumbCountWithLongName =
			navWithLongName.querySelectorAll(':scope > *').length;

		cleanup();
		mocks.respond.mockReset();

		const shortName = 'Acme';
		mocks.respond.mockImplementation(async (call) => {
			if (pathEndsWith(call, 'byTenantId', 'get')) {
				return {
					tenantId: 'tenant-1',
					name: shortName,
					maxUsers: 10,
					status: 'active',
				};
			}

			return {};
		});

		const shortQueryClient = new QueryClient({
			defaultOptions: { queries: { retry: false, staleTime: 30_000 } },
		});
		const shortRouter = buildTestRouter(
			'/staff/tenants/tenant-1',
			shortQueryClient,
		);

		render(
			<QueryClientProvider client={shortQueryClient}>
				<RouterProvider router={shortRouter} />
			</QueryClientProvider>,
		);

		const shortNameNode = await waitFor(() => {
			const node = screen.getByTestId('app-shell-breadcrumb-entity-name');
			expect(node.textContent).toBe(shortName);
			return node;
		});

		// Short names must be completely unaffected: the exact same DOM
		// shape (same classes on the crumb, same crumb count) as the long
		// name above — no length-triggered conditional markup, no reserved
		// empty space held back for a truncation ellipsis that never fires.
		expect(shortNameNode.className.split(' ')).toEqual(longNameClasses);

		const navWithShortName = screen.getByRole('navigation', {
			name: 'nav-breadcrumb',
		});
		expect(navWithShortName.querySelectorAll(':scope > *').length).toBe(
			crumbCountWithLongName,
		);
	});

	/**
	 * #977: the tenant-profile detail sections became path segments, so each
	 * one is now its OWN route with its OWN declared trail. The risk this
	 * guards is exactly the one the issue names — a new segment rendering as
	 * raw path text, or falling back to the parent's generic trail, instead
	 * of the section's name under the profile's real name.
	 *
	 * Same shape as the tenant guard above: `staticData` is taken directly off
	 * the production route modules (`Route.options.staticData`), never
	 * re-typed, and the real `AppShell` + real `deriveBreadcrumbTrail` + real
	 * `EntityCrumb` render it.
	 *
	 * Only `staticData` comes from those modules — the section components here
	 * are marker divs, because a crumb trail is derived from `useMatches()`
	 * and the route declarations alone and never reads what a body rendered.
	 * The real bodies are exercised in `$profileId/section-routing.test.tsx`.
	 */
	const buildProfileSectionRouter = (
		initialUrl: string,
		queryClient: QueryClient,
	) => {
		const rootRoute = createRootRoute({
			component: AppShellHost,
			staticData: { crumbs: 'shell' },
		});
		const layoutRoute = createRoute({
			getParentRoute: () => rootRoute,
			path: '/staff/tenants/$tenantId/profiles/$profileId',
			staticData: TenantProfileDetailsRoute.options.staticData,
			component: () => <Outlet />,
		});
		const overviewRoute = createRoute({
			getParentRoute: () => layoutRoute,
			path: '/',
			staticData: TenantProfileOverviewRoute.options.staticData,
			component: () => <div data-testid="section-body" />,
		});
		const permissionsRoute = createRoute({
			getParentRoute: () => layoutRoute,
			path: '/permissions',
			staticData: TenantProfilePermissionsRoute.options.staticData,
			component: () => <div data-testid="section-body" />,
		});
		const membersRoute = createRoute({
			getParentRoute: () => layoutRoute,
			path: '/members',
			staticData: TenantProfileMembersRoute.options.staticData,
			component: () => <div data-testid="section-body" />,
		});
		const routeTreeForTest = rootRoute.addChildren([
			layoutRoute.addChildren([overviewRoute, permissionsRoute, membersRoute]),
		]);

		return createRouter(
			widenOptions<Parameters<typeof createRouter>[0]>({
				routeTree: routeTreeForTest,
				history: createMemoryHistory({ initialEntries: [initialUrl] }),
				context: { queryClient },
			}),
		);
	};

	const renderProfileSectionCrumbs = async (initialUrl: string) => {
		mocks.respond.mockImplementation((call) => {
			if (pathEndsWith(call, 'byProfileId', 'get')) {
				return { profile: { id: 'profile-1', name: 'Approvers' } };
			}

			if (pathEndsWith(call, 'byTenantId', 'get')) {
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

		render(
			<QueryClientProvider client={queryClient}>
				<RouterProvider
					router={buildProfileSectionRouter(initialUrl, queryClient)}
				/>
			</QueryClientProvider>,
		);

		await waitFor(() => {
			expect(
				screen.getByRole('navigation', { name: 'nav-breadcrumb' }).textContent,
			).toContain('Approvers');
		});
	};

	/**
	 * Always re-query the nav: an unrelated re-render may replace the node, so
	 * a reference captured earlier can go stale (the same trap guard B's
	 * skeleton test documents). The row interleaves chevron separators between
	 * crumbs, so drop those.
	 */
	const breadcrumbNav = (): HTMLElement =>
		screen.getByRole('navigation', { name: 'nav-breadcrumb' });

	const crumbTextsOf = (): (string | null)[] =>
		[...breadcrumbNav().children]
			.filter(
				(node) => !node.classList.contains('app-shell-breadcrumb-chevron'),
			)
			.map((node) => node.textContent);

	test('#977: a profile section route renders the section name under the profile’s real name, not raw path text', async () => {
		await renderProfileSectionCrumbs(
			'/staff/tenants/tenant-1/profiles/profile-1/permissions',
		);
		const permissionsCrumbs = crumbTextsOf();

		// The trail ends with the section, and the crumb before it is the
		// profile's own resolved entity name — not a raw path segment, and not
		// a generic parent fallback. i18next is uninitialised in this suite, so
		// `t()` echoes the key: seeing `common:permissions` (the shared section
		// label key) rather than the literal URL segment `permissions` is the
		// point — the crumb is a declared label, not path text.
		expect(permissionsCrumbs.at(-1)).toBe('common:permissions');
		expect(permissionsCrumbs.at(-2)).toBe('Approvers');
		expect(permissionsCrumbs).toContain('Acme Corporation');
		expect(
			breadcrumbNav().querySelector(
				'[data-testid="app-shell-breadcrumb-entity-fallback"]',
			),
		).toBeNull();
		// The section is the terminal crumb — rendered by the shell as the
		// non-link "current" node, not as another link back up the trail.
		expect(
			breadcrumbNav().querySelector('.app-shell-breadcrumb-current')
				?.textContent,
		).toBe('common:permissions');

		cleanup();
		mocks.respond.mockReset();

		await renderProfileSectionCrumbs(
			'/staff/tenants/tenant-1/profiles/profile-1/members',
		);
		const membersCrumbs = crumbTextsOf();
		expect(membersCrumbs.at(-1)).toBe('common:members');
		expect(membersCrumbs.at(-2)).toBe('Approvers');

		cleanup();
		mocks.respond.mockReset();

		// Overview is the index child: it adds NO section crumb — the profile
		// itself is the current page.
		await renderProfileSectionCrumbs(
			'/staff/tenants/tenant-1/profiles/profile-1',
		);
		const overviewCrumbs = crumbTextsOf();
		expect(overviewCrumbs.at(-1)).toBe('Approvers');
		expect(overviewCrumbs).toHaveLength(permissionsCrumbs.length - 1);
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
