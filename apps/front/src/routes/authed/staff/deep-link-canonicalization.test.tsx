import {
	createMemoryHistory,
	createRootRoute,
	createRoute,
	createRouter,
	RouterProvider,
} from '@tanstack/react-router';
/** @vitest-environment jsdom */
/**
 * W4-GUARDS (round-4 remediation, W4-TEN F1): the prior "canonicalization"
 * tests mocked `@tanstack/react-router`, called `Route.validateSearch(...)`
 * directly, and manually wrote the result into a mocked `search` prop — they
 * never observed a URL or let the router itself decide what survives a
 * navigation. TanStack Router merges a route's validated search back over
 * the raw parsed search (`{ ...result, ...validated }`), so simply omitting
 * an unrecognized key from the validated object does NOT delete it from the
 * final URL. This suite builds a REAL router with real memory history
 * seeded at a malformed deep link, mounts `RouterProvider`, waits for the
 * route to settle, and asserts both (a) the router's own resolved URL no
 * longer contains the malformed raw key/value and (b) the route's own
 * `useSearch()` state — what any rendered control reads — sits at its
 * canonical default. It never calls `validateSearch` itself and never
 * injects a mocked search object.
 */
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, test } from 'vitest';
import {
	parseInvitationListSearchParams,
	type InvitationListSearchParamInput,
} from '~/routes/authed/staff/invitations/list-helpers';
import { Route as StaffProfilesRoute } from '~/routes/authed/staff/profiles';
import { Route as TenantsRoute } from '~/routes/authed/staff/tenants';
import { parseTenantListSearchParams } from '~/routes/authed/staff/tenants-list-helpers';
import {
	parseTenantUsersListSearchParams,
	type TenantUsersListSearchParamInput,
} from '~/routes/authed/staff/tenants/$tenantId/_users-search-params';
import { Route as TenantInvitationsRoute } from '~/routes/authed/staff/tenants/$tenantId/invitations';
import {
	parseStaffTenantProfilesSearchParams,
	Route as TenantProfilesRoute,
	type StaffTenantProfilesSearchParamInput,
} from '~/routes/authed/staff/tenants/$tenantId/profiles';
import { Route as TenantProfileDetailsRoute } from '~/routes/authed/staff/tenants/$tenantId/profiles/$profileId';
import { Route as TenantProfileOverviewRoute } from '~/routes/authed/staff/tenants/$tenantId/profiles/$profileId/index';
import {
	parseProfileDetailsSearchParams,
	parseProfileOverviewSearchParams,
	type ProfileDetailsSearchParamInput,
	type ProfileOverviewSearchParamInput,
} from '~/routes/authed/staff/tenants/$tenantId/profiles/_profile-details-search';
import { Route as TenantUsersRoute } from '~/routes/authed/staff/tenants/$tenantId/users';

// Every harness below reuses the exact production `validateSearch` function
// object off the route module's own `Route.options` — never a re-typed
// copy — so a change to the real validation logic is exercised here too.
const asValidateSearch = <TInput extends Record<string, unknown>>(route: {
	options: { validateSearch?: unknown };
}): ((search: TInput) => Record<string, unknown>) =>
	route.options.validateSearch as (search: TInput) => Record<string, unknown>;

/** Same idea for `beforeLoad`: reuse the production function object off the
 * route module's own `Route.options`, widened so mounting it on a throwaway
 * route tree does not drag the real route's parent type along with it. */
type LooseBeforeLoad = (context: {
	params: Record<string, string>;
	search: Record<string, unknown>;
}) => void;

const asBeforeLoad = (route: {
	options: { beforeLoad?: unknown };
}): LooseBeforeLoad => route.options.beforeLoad as LooseBeforeLoad;

const rootRoute = createRootRoute();

/** Builds a tiny isolated router mounted at `path`, whose `validateSearch`
 * is the exact production round-trip (parse then serialize) for that
 * domain, and whose component renders the route's own resolved search
 * fields as text so the test can assert on the SAME state a real control
 * would read — without re-implementing or calling the parser itself. */
const buildHarness = <TInput extends Record<string, unknown>>(
	path: string,
	validateSearch: (search: TInput) => Record<string, unknown>,
	renderFields: (search: Record<string, unknown>) => Record<string, string>,
	initialUrl: string,
) => {
	const route = createRoute({
		getParentRoute: () => rootRoute,
		path,
		staticData: { crumbs: 'shell' },
		validateSearch: (search) => validateSearch(search as TInput),
		component: () => {
			const search = route.useSearch() as Record<string, unknown>;
			const fields = renderFields(search);
			return (
				<div data-testid="resolved-search">
					{Object.entries(fields).map(([key, value]) => (
						<span key={key} data-testid={`field-${key}`}>
							{value}
						</span>
					))}
				</div>
			);
		},
	});
	const routeTree = rootRoute.addChildren([route]);
	const history = createMemoryHistory({ initialEntries: [initialUrl] });
	const router = createRouter({ routeTree, history });
	return { router, history };
};

describe('malformed deep links are canonicalized at the router boundary (r4-tenants-F1)', () => {
	afterEach(() => {
		cleanup();
	});

	test('tenants: mixed, duplicate, and partly invalid statuses rewrite canonically', async () => {
		const { router, history } = buildHarness(
			'/staff/tenants',
			asValidateSearch(TenantsRoute),
			(search) => ({
				status: parseTenantListSearchParams(search).status.join(','),
			}),
			'/staff/tenants?status=Suspended%2Cactive%2Cbogus%2Cactive',
		);

		render(<RouterProvider router={router} />);
		await waitFor(() => screen.getByTestId('resolved-search'));

		expect(screen.getByTestId('field-status').textContent).toBe(
			'active,suspended',
		);
		expect(
			new URL(history.location.href, 'http://localhost').searchParams.get(
				'status',
			),
		).toBe('active,suspended');
	});

	test('staff profiles: table sorting remains snake_case after validation', async () => {
		const { router, history } = buildHarness(
			'/staff/profiles',
			asValidateSearch(StaffProfilesRoute),
			(search) => ({
				sort_id: String(search.sort_id ?? ''),
				sort_order: String(search.sort_order ?? ''),
			}),
			'/staff/profiles?size=25&sort_id=name&sort_order=asc',
		);

		render(<RouterProvider router={router} />);
		await waitFor(() => screen.getByTestId('resolved-search'));

		const params = new URL(history.location.href, 'http://localhost')
			.searchParams;
		expect(params.get('size')).toBe('25');
		expect(params.get('sort_id')).toBe('name');
		expect(params.get('sort_order')).toBe('asc');
		expect(params.has('sortId')).toBe(false);
		expect(params.has('sortOrder')).toBe(false);
	});

	test('tenants: wholly invalid statuses are omitted', async () => {
		const { router, history } = buildHarness(
			'/staff/tenants',
			asValidateSearch(TenantsRoute),
			(search) => ({
				status: parseTenantListSearchParams(search).status.join(',') || 'all',
			}),
			'/staff/tenants?status=bogus%2Cunknown',
		);
		render(<RouterProvider router={router} />);
		await waitFor(() => screen.getByTestId('resolved-search'));
		expect(screen.getByTestId('field-status').textContent).toBe('all');
		expect(
			new URL(history.location.href, 'http://localhost').searchParams.has(
				'status',
			),
		).toBe(false);
	});

	test('tenant users: unrecognized status/level and a non-1 invite value are dropped from the URL', async () => {
		const { router, history } = buildHarness(
			'/staff/tenants/$tenantId/users',
			asValidateSearch(TenantUsersRoute),
			(search) => {
				const parsed = parseTenantUsersListSearchParams(
					search as TenantUsersListSearchParamInput,
				);
				return {
					status: parsed.status ?? 'all',
					level: parsed.level ?? 'all',
					invite: parsed.invite === 1 ? 'open' : 'closed',
				};
			},
			'/staff/tenants/t1/users?status=bogus&level=owner&invite=2',
		);

		render(<RouterProvider router={router} />);
		await waitFor(() => screen.getByTestId('resolved-search'));

		expect(screen.getByTestId('field-status').textContent).toBe('all');
		expect(screen.getByTestId('field-level').textContent).toBe('all');
		expect(screen.getByTestId('field-invite').textContent).toBe('closed');
		expect(history.location.href).not.toContain('bogus');
		expect(history.location.href).not.toContain('owner');
		expect(history.location.href).not.toContain('invite=2');
	});

	test('tenant profiles: unrecognized is_default/view/new values are dropped from the URL', async () => {
		const { router, history } = buildHarness(
			'/staff/tenants/$tenantId/profiles',
			asValidateSearch(TenantProfilesRoute),
			(search) => {
				const parsed = parseStaffTenantProfilesSearchParams(
					search as StaffTenantProfilesSearchParamInput,
				);
				return {
					is_default:
						parsed.is_default === undefined ? 'all' : String(parsed.is_default),
					view: parsed.view ?? 'cards',
					new: parsed.new === 1 ? 'open' : 'closed',
				};
			},
			'/staff/tenants/t1/profiles?is_default=maybe&view=list&new=yes',
		);

		render(<RouterProvider router={router} />);
		await waitFor(() => screen.getByTestId('resolved-search'));

		expect(screen.getByTestId('field-is_default').textContent).toBe('all');
		expect(screen.getByTestId('field-view').textContent).toBe('cards');
		expect(screen.getByTestId('field-new').textContent).toBe('closed');
		expect(history.location.href).not.toContain('maybe');
		expect(history.location.href).not.toContain('view=list');
		expect(history.location.href).not.toContain('new=yes');
	});

	// #972: the LIST's `edit` param carries a profile id, so it must survive as
	// a raw string. A value the router's parser turns into something other than
	// a string (an unquoted number, a boolean) cannot be an id and cannot
	// round-trip losslessly, so it is dropped rather than re-quoted.
	test('tenant profiles list: a real profile id survives as a raw string, non-string edit values are dropped', async () => {
		const profileId = '0198c0de-2222-7000-8000-bbbbbbbbbbbb';
		const { router, history } = buildHarness(
			'/staff/tenants/$tenantId/profiles',
			asValidateSearch(TenantProfilesRoute),
			(search) => ({
				edit:
					parseStaffTenantProfilesSearchParams(
						search as StaffTenantProfilesSearchParamInput,
					).edit ?? 'closed',
			}),
			`/staff/tenants/t1/profiles?edit=${profileId}`,
		);

		render(<RouterProvider router={router} />);
		await waitFor(() => screen.getByTestId('resolved-search'));

		expect(screen.getByTestId('field-edit').textContent).toBe(profileId);
		expect(
			new URL(history.location.href, 'http://localhost').searchParams.get(
				'edit',
			),
		).toBe(profileId);
	});

	// The two drawer-open flags on this route are mutually exclusive. A URL
	// carrying both is not a state the UI has a meaning for, so the boundary
	// resolves it to the one that names a specific row and drops the other.
	test('tenant profiles list: a URL carrying both drawer flags keeps edit and drops new', async () => {
		const profileId = '0198c0de-2222-7000-8000-bbbbbbbbbbbb';
		const { router, history } = buildHarness(
			'/staff/tenants/$tenantId/profiles',
			asValidateSearch(TenantProfilesRoute),
			(search) => {
				const parsed = parseStaffTenantProfilesSearchParams(
					search as StaffTenantProfilesSearchParamInput,
				);
				return {
					edit: parsed.edit ?? 'closed',
					new: parsed.new === 1 ? 'open' : 'closed',
				};
			},
			`/staff/tenants/t1/profiles?new=1&edit=${profileId}`,
		);

		render(<RouterProvider router={router} />);
		await waitFor(() => screen.getByTestId('resolved-search'));

		expect(screen.getByTestId('field-edit').textContent).toBe(profileId);
		expect(screen.getByTestId('field-new').textContent).toBe('closed');
		const params = new URL(history.location.href, 'http://localhost')
			.searchParams;
		expect(params.get('edit')).toBe(profileId);
		expect(params.has('new')).toBe(false);
	});

	test('tenant profiles list: a numeric or boolean edit value is dropped from the URL', async () => {
		const { router, history } = buildHarness(
			'/staff/tenants/$tenantId/profiles',
			asValidateSearch(TenantProfilesRoute),
			(search) => ({
				edit:
					parseStaffTenantProfilesSearchParams(
						search as StaffTenantProfilesSearchParamInput,
					).edit ?? 'closed',
			}),
			'/staff/tenants/t1/profiles?edit=5',
		);

		render(<RouterProvider router={router} />);
		await waitFor(() => screen.getByTestId('resolved-search'));

		expect(screen.getByTestId('field-edit').textContent).toBe('closed');
		expect(history.location.href).not.toContain('edit=');
	});

	test('tenant profile details: a non-1 edit value is dropped from the URL', async () => {
		const { router, history } = buildHarness(
			'/staff/tenants/$tenantId/profiles/$profileId',
			asValidateSearch(TenantProfileDetailsRoute),
			(search) => {
				const parsed = parseProfileDetailsSearchParams(
					search as ProfileDetailsSearchParamInput,
				);
				return { edit: parsed.edit === 1 ? 'open' : 'closed' };
			},
			'/staff/tenants/t1/profiles/p1?edit=2',
		);

		render(<RouterProvider router={router} />);
		await waitFor(() => screen.getByTestId('resolved-search'));

		expect(screen.getByTestId('field-edit').textContent).toBe('closed');
		expect(history.location.href).not.toContain('edit=2');
	});

	test('tenant profile details: a "yes" edit value is dropped from the URL', async () => {
		const { router, history } = buildHarness(
			'/staff/tenants/$tenantId/profiles/$profileId',
			asValidateSearch(TenantProfileDetailsRoute),
			(search) => {
				const parsed = parseProfileDetailsSearchParams(
					search as ProfileDetailsSearchParamInput,
				);
				return { edit: parsed.edit === 1 ? 'open' : 'closed' };
			},
			'/staff/tenants/t1/profiles/p1?edit=yes',
		);

		render(<RouterProvider router={router} />);
		await waitFor(() => screen.getByTestId('resolved-search'));

		expect(screen.getByTestId('field-edit').textContent).toBe('closed');
		expect(history.location.href).not.toContain('edit=yes');
	});

	// #977: sections are path segments now. `?tab=` survives only on the
	// OVERVIEW (index) route, and only long enough for that route's
	// `beforeLoad` to redirect — an unrecognized value never persists.
	test('tenant profile overview: an invalid tab resolves to no tab without persisting a default', async () => {
		const { router, history } = buildHarness(
			'/staff/tenants/$tenantId/profiles/$profileId',
			asValidateSearch(TenantProfileOverviewRoute),
			(search) => {
				const parsed = parseProfileOverviewSearchParams(
					search as ProfileOverviewSearchParamInput,
				);
				return { tab: parsed.tab ?? 'overview' };
			},
			'/staff/tenants/t1/profiles/p1?tab=unsupported',
		);

		render(<RouterProvider router={router} />);
		await waitFor(() => screen.getByTestId('resolved-search'));

		expect(screen.getByTestId('field-tab').textContent).toBe('overview');
		expect(history.location.href).not.toContain('tab=');
	});

	/**
	 * #977 legacy-link redirect. `?tab=permissions` / `?tab=members` links are
	 * in the wild (bookmarks, pasted URLs); silently ignoring one would land
	 * the visitor on Overview and read as data loss.
	 *
	 * This drives the REAL overview route's own `beforeLoad` and
	 * `validateSearch` (read straight off `Route.options`, never re-typed —
	 * the same pattern `asValidateSearch` already establishes in this file)
	 * on a real router with real memory history, then asserts the router's own
	 * resolved URL: the section path is reached and the legacy param is gone
	 * from the address bar.
	 *
	 * What is NOT real here, deliberately: the three routes are declared flat
	 * rather than layout-plus-children, and their components are marker divs.
	 * Redirect resolution is decided entirely by `validateSearch` +
	 * `beforeLoad` + the destination path, none of which depend on nesting or
	 * on what the destination renders. The real nesting, the real bodies and
	 * the guard interactions are covered in
	 * `$profileId/section-routing.test.tsx`.
	 */
	const buildLegacyTabHarness = (initialUrl: string) => {
		const overviewRoute = createRoute({
			getParentRoute: () => rootRoute,
			path: '/staff/tenants/$tenantId/profiles/$profileId',
			staticData: { crumbs: 'shell' },
			validateSearch: asValidateSearch(TenantProfileOverviewRoute),
			beforeLoad: asBeforeLoad(TenantProfileOverviewRoute),
			component: () => <div data-testid="section-overview" />,
		});
		const permissionsRoute = createRoute({
			getParentRoute: () => rootRoute,
			path: '/staff/tenants/$tenantId/profiles/$profileId/permissions',
			staticData: { crumbs: 'shell' },
			validateSearch: asValidateSearch(TenantProfileDetailsRoute),
			component: () => <div data-testid="section-permissions" />,
		});
		const membersRoute = createRoute({
			getParentRoute: () => rootRoute,
			path: '/staff/tenants/$tenantId/profiles/$profileId/members',
			staticData: { crumbs: 'shell' },
			validateSearch: asValidateSearch(TenantProfileDetailsRoute),
			component: () => <div data-testid="section-members" />,
		});
		const routeTree = rootRoute.addChildren([
			overviewRoute,
			permissionsRoute,
			membersRoute,
		]);
		const history = createMemoryHistory({ initialEntries: [initialUrl] });

		return { router: createRouter({ routeTree, history }), history };
	};

	test('tenant profile details: a legacy ?tab=permissions link redirects to the permissions path and drops the param', async () => {
		const { router, history } = buildLegacyTabHarness(
			'/staff/tenants/t1/profiles/p1?tab=permissions',
		);

		render(<RouterProvider router={router} />);

		await waitFor(() => screen.getByTestId('section-permissions'));
		expect(history.location.pathname).toBe(
			'/staff/tenants/t1/profiles/p1/permissions',
		);
		expect(history.location.href).not.toContain('tab=');
		expect(screen.queryByTestId('section-overview')).toBeNull();
	});

	test('tenant profile details: a legacy ?tab=members link redirects to the members path, keeping ?edit=1', async () => {
		const { router, history } = buildLegacyTabHarness(
			'/staff/tenants/t1/profiles/p1?tab=members&edit=1',
		);

		render(<RouterProvider router={router} />);

		await waitFor(() => screen.getByTestId('section-members'));
		expect(history.location.pathname).toBe(
			'/staff/tenants/t1/profiles/p1/members',
		);
		const params = new URL(history.location.href, 'http://localhost')
			.searchParams;
		expect(params.has('tab')).toBe(false);
		// `?edit=1` is genuine view state and is valid on every section — the
		// redirect must not silently close the drawer.
		expect(params.get('edit')).toBe('1');
	});

	test('tenant profile details: the legacy redirect replaces its history entry, so Back does not bounce through it', async () => {
		const { router, history } = buildLegacyTabHarness(
			'/staff/tenants/t1/profiles/p1?tab=permissions',
		);

		render(<RouterProvider router={router} />);
		await waitFor(() => screen.getByTestId('section-permissions'));

		// One entry, not two: the legacy URL was replaced rather than pushed.
		expect(history.canGoBack()).toBe(false);
	});

	test('tenant invitations: an unrecognized status key is dropped from the URL', async () => {
		const { router, history } = buildHarness(
			'/staff/tenants/$tenantId/invitations',
			asValidateSearch(TenantInvitationsRoute),
			(search) => {
				const parsed = parseInvitationListSearchParams(
					search as InvitationListSearchParamInput,
				);
				return { status: parsed.status ?? 'all' };
			},
			'/staff/tenants/t1/invitations?status=bogus',
		);

		render(<RouterProvider router={router} />);
		await waitFor(() => screen.getByTestId('resolved-search'));

		expect(screen.getByTestId('field-status').textContent).toBe('all');
		expect(history.location.href).not.toContain('bogus');
	});
});
