import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
/** @vitest-environment jsdom */
/**
 * #977 Tier-2 guard: the tenant-profile detail sections as REAL path
 * segments, driven through a REAL TanStack router.
 *
 * What is real here:
 *  - six production route objects — the layout (`$profileId.tsx`), its three
 *    section children (`$profileId/index.tsx`, `/permissions`, `/members`),
 *    and the two siblings that are NOT its children (`$profileId/users.tsx`
 *    and the `$profileId-edit.tsx` redirect shim). Each is imported and
 *    `.update()`-ed onto a throwaway parent exactly the way `routeTree.gen`
 *    wires them, so their real ids, paths, `staticData`, `validateSearch`,
 *    `beforeLoad` and `component` are the ones under test. Nothing is
 *    re-declared or copied.
 *  - the ONLY stub route is the profiles list, which this suite never asserts
 *    anything about beyond "navigation reached it (or was stopped first)".
 *  - a real `createRouter` + `createMemoryHistory`, real `<Link>`
 *    navigation, real `useBlocker` registration, real `Outlet` nesting.
 *  - the real section bodies (`ProfileOverviewTab`,
 *    `ProfilePermissionsTab` + `PermissionMatrix`, `ProfileMembersTab`) and
 *    the real edit drawer.
 *
 * What is faked: only the network-facing query hooks (`useQuery`-wrapping
 * exports of the two `~/lib/query/*` modules) and i18n. Every pure helper in
 * those modules — `toStaffTenantProfileDetails`,
 * `buildStaffTenantPermissionCatalogGroups`, the `*CrumbQuery` pairs — stays
 * the real implementation via `importOriginal`.
 *
 * The synthetic parent is the pattern this repo already uses for real-route
 * tests (`deep-link-canonicalization.test.tsx`,
 * `breadcrumb-contract.test.tsx` guard B): mounting the whole app route tree
 * would drag in session/auth bootstrapping that has nothing to do with the
 * thing being proved.
 */
import type { BlockerFn } from '@tanstack/react-router';
import type { AnyRouter } from '@tanstack/react-router';
import {
	createBrowserHistory,
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
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { TestLabelMap } from '~/lib/testing/test-label-map';

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const PROFILE_ID = '22222222-2222-2222-2222-222222222222';
const PROFILES_LIST_PATH = `/staff/tenants/${TENANT_ID}/profiles`;
const OVERVIEW_PATH = `${PROFILES_LIST_PATH}/${PROFILE_ID}`;
const PERMISSIONS_PATH = `${OVERVIEW_PATH}/permissions`;
const MEMBERS_PATH = `${OVERVIEW_PATH}/members`;

const mocks = vi.hoisted(() => ({
	tenantDetails: {
		tenantId: '11111111-1111-1111-1111-111111111111',
		name: 'Acme Corporation',
		code: 'ACME',
		status: 'active',
		usersCount: 12,
		maxUsers: 50,
	},
	profileDetails: {
		profile: {
			id: '22222222-2222-2222-2222-222222222222',
			name: 'Approvers',
			description: 'Can review approvals',
			isDefault: false,
			userAccountCount: 7,
		},
	},
	permissionKeys: ['tenant.users.read'],
	permissionCatalog: {
		tenant: {
			'tenant.users.read': {
				key: 'tenant.users.read',
				name: 'Read users',
				description: null,
			},
			'tenant.users.write': {
				key: 'tenant.users.write',
				name: 'Write users',
				description: null,
			},
		},
	},
	deleteProfile: vi.fn().mockResolvedValue(undefined),
	assignPermission: vi.fn().mockResolvedValue(undefined),
	unassignPermission: vi.fn().mockResolvedValue(undefined),
	updateProfile: vi.fn().mockResolvedValue(undefined),
}));

const settledQuery = (data: unknown) => ({
	data,
	error: null,
	isPending: false,
	isError: false,
	isFetching: false,
	isSuccess: true,
	refetch: vi.fn().mockResolvedValue(undefined),
});

const settledMutation = (mutateAsync: unknown) => ({
	isPending: false,
	mutate: vi.fn(),
	mutateAsync,
});

vi.mock('~/lib/query/staff-tenants', async (importOriginal) => {
	const actual =
		await importOriginal<typeof import('~/lib/query/staff-tenants')>();

	return {
		...actual,
		useStaffTenantDetailsQuery: () => settledQuery(mocks.tenantDetails),
		invalidateAllStaffTenantScopes: () => Promise.resolve(),
		// #851: the awaited route loader resolves through this factory; stub
		// it so the loader never reaches the real network-backed fetcher.
		staffTenantDetailsQueryOptions: {
			queryKey: (variables: { tenantId: string }) => [
				'staff',
				'staff-tenants',
				'details',
				variables.tenantId,
			],
			fetcher: async (variables: { tenantId: string }) =>
				variables.tenantId === 't1' ? mocks.tenantDetails : null,
		},
	};
});

vi.mock('~/lib/query/staff-tenant-profiles', async (importOriginal) => {
	const actual =
		await importOriginal<typeof import('~/lib/query/staff-tenant-profiles')>();

	return {
		...actual,
		useStaffTenantProfileDetailsQuery: () => settledQuery(mocks.profileDetails),
		// #851: same as above — keep the awaited route loader off the network.
		staffTenantProfileDetailsQueryOptions: {
			queryKey: (variables: { tenantId: string; profileId: string }) => [
				'staff',
				'staff-tenants',
				'profiles',
				'detail',
				variables.tenantId,
				variables.profileId,
			],
			fetcher: async (variables: { tenantId: string; profileId: string }) =>
				variables.profileId === 'p1' ? { profile: mocks.profileDetails } : null,
		},
		useStaffTenantProfilePermissionKeysQuery: () =>
			settledQuery({ permissionKeys: mocks.permissionKeys }),
		useStaffTenantPermissionCatalogQuery: () =>
			settledQuery({ additionalData: mocks.permissionCatalog }),
		useStaffTenantProfileMembersQuery: () => settledQuery({ users: [] }),
		useStaffTenantProfileMemberAssignmentResolutionQuery: () =>
			settledQuery({}),
		useStaffTenantProfilesQuery: () => settledQuery({ profiles: [] }),
		getStaffTenantProfilePermissionKeysCacheSnapshot: () => ({
			permissionKeys: mocks.permissionKeys,
			revision: 1,
		}),
		useDeleteStaffTenantProfileMutation: () =>
			settledMutation(mocks.deleteProfile),
		useUpdateStaffTenantProfileMutation: () =>
			settledMutation(mocks.updateProfile),
		useAssignStaffTenantProfilePermissionMutation: () =>
			settledMutation(mocks.assignPermission),
		useUnassignStaffTenantProfilePermissionMutation: () =>
			settledMutation(mocks.unassignPermission),
	};
});

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string, options?: Record<string, unknown>) => {
			const bare = key.includes(':') ? (key.split(':').at(-1) ?? key) : key;
			const labels: TestLabelMap = {
				overview: 'Overview',
				permissions: 'Permissions',
				members: 'Members',
				edit: 'Edit',
				'unsaved-changes-dialog-title': 'Leave without saving?',
				'leave-page': 'Leave page',
				cancel: 'Cancel',
			};
			let text = labels[bare] ?? bare;
			for (const [optionKey, value] of Object.entries(options ?? {})) {
				text = text.replaceAll(`{{${optionKey}}}`, String(value));
			}

			return text;
		},
		i18n: { language: 'en' },
	}),
}));

import { Route as ProfileDetailsRoute } from '../$profileId';
import { Route as ProfileEditShimRoute } from '../$profileId-edit';
import { Route as ProfileOverviewRoute } from './index';
import { Route as ProfileMembersRoute } from './members';
import { Route as ProfilePermissionsRoute } from './permissions';
import { Route as ProfileUsersRoute } from './users';

/**
 * `createFileRoute(...)(options)` does not attach the id/path/parent — the
 * generated `routeTree.gen.ts` does, with exactly this `.update()` call. Doing
 * the same here mounts the REAL route object (same identity, so its own
 * `Route.useParams()`/`useSearch()`/`useNavigate()` resolve against the
 * router built below), just under a throwaway parent.
 */
const mountRealRoute = <TRoute,>(
	route: TRoute,
	options: Record<string, unknown>,
): TRoute => {
	(route as { update: (options: Record<string, unknown>) => void }).update(
		options,
	);

	return route;
};

/** Browser history attaches a window-level `beforeunload` listener on
 * creation; leaking one into a later test would let a stale blocker answer
 * that test's event. Every harness registers here and is destroyed on
 * teardown. */
const openHistories: { destroy: () => void }[] = [];

const destroyOpenHistories = (): void => {
	while (openHistories.length > 0) {
		openHistories.pop()?.destroy();
	}
};

/**
 * Memory history is what every navigation test below wants — but it never
 * registers a `beforeunload` listener at all (that lives in
 * `createBrowserHistory`), so the leave-site-prompt tests need the real
 * browser history over jsdom's window, seeded by rewriting the URL first.
 */
const buildHistory = (initialUrl: string, kind: 'memory' | 'browser') => {
	if (kind === 'memory') {
		return createMemoryHistory({ initialEntries: [initialUrl] });
	}

	window.history.replaceState(null, '', initialUrl);

	return createBrowserHistory();
};

const buildRouter = (
	initialUrl: string,
	{ history: historyKind = 'memory' as 'memory' | 'browser' } = {},
) => {
	const rootRoute = createRootRoute({
		staticData: { crumbs: 'shell' },
		component: () => <Outlet />,
	});
	const layoutRoute = createRoute({
		getParentRoute: () => rootRoute,
		id: '/_authed-layout',
		staticData: { crumbs: 'shell' },
		component: () => <Outlet />,
	});
	const detailsRoute = mountRealRoute(ProfileDetailsRoute, {
		id: '/staff/tenants/$tenantId/profiles/$profileId',
		path: '/staff/tenants/$tenantId/profiles/$profileId',
		getParentRoute: () => layoutRoute,
	});
	const overviewRoute = mountRealRoute(ProfileOverviewRoute, {
		id: '/',
		path: '/',
		getParentRoute: () => detailsRoute,
	});
	const permissionsRoute = mountRealRoute(ProfilePermissionsRoute, {
		id: '/permissions',
		path: '/permissions',
		getParentRoute: () => detailsRoute,
	});
	const membersRoute = mountRealRoute(ProfileMembersRoute, {
		id: '/members',
		path: '/members',
		getParentRoute: () => detailsRoute,
	});
	// The three sibling destinations that are NOT children of the layout.
	// Navigating to any of them unmounts it, taking an open drawer's draft
	// with it — which is exactly why `isProfileSectionPathname` must not
	// classify them as sections. `/users` and `/edit` are the REAL production
	// routes (the `/edit` shim's real `beforeLoad` redirect included), so the
	// harness can drive genuine navigation, unmount and redirect behaviour for
	// them rather than asserting against a stand-in. Only the profiles list is
	// a stub: this suite never asserts anything about the list page itself,
	// only that navigation reached (or was stopped before) it.
	const profileUsersRoute = mountRealRoute(ProfileUsersRoute, {
		id: '/staff/tenants/$tenantId/profiles/$profileId/users',
		path: '/staff/tenants/$tenantId/profiles/$profileId/users',
		getParentRoute: () => layoutRoute,
	});
	const profileEditShimRoute = mountRealRoute(ProfileEditShimRoute, {
		id: '/staff/tenants/$tenantId/profiles/$profileId/edit',
		path: '/staff/tenants/$tenantId/profiles/$profileId/edit',
		getParentRoute: () => layoutRoute,
	});
	const profilesListRoute = createRoute({
		getParentRoute: () => layoutRoute,
		path: '/staff/tenants/$tenantId/profiles',
		staticData: { crumbs: 'shell' },
		component: () => <div data-testid="profiles-list-page" />,
	});

	// `.addChildren` exists at runtime on every route but is absent from the
	// exported `options` union; the helper is the one widening point and each
	// call names its shape once.
	const widenOptions = <T,>(value: unknown): T => {
		return value as T;
	};
	const addChildrenOf = (route: unknown) => {
		return widenOptions<{ addChildren: (children: unknown[]) => void }>(route)
			.addChildren;
	};
	const routeTree = addChildrenOf(rootRoute)([
		addChildrenOf(layoutRoute)([
			addChildrenOf(detailsRoute)([
				overviewRoute,
				permissionsRoute,
				membersRoute,
			]),
			profileUsersRoute,
			profileEditShimRoute,
			profilesListRoute,
		]),
	]);

	const history = buildHistory(initialUrl, historyKind);
	// The blockers array inside `createHistory` is closed over, so capture
	// every registration as it happens. This is the SAME object the router
	// hands to `useBlocker`; nothing about the production predicate is
	// re-implemented here. Typed with the package's own BlockerFn so the
	// shim stays assignable to the real history.block parameter.
	const blockers: BlockerFn[] = [];
	const originalBlock = history.block.bind(history);
	history.block = (registration) => {
		blockers.push(registration.blockerFn);

		return originalBlock(registration);
	};

	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	const router: AnyRouter = createRouter(
		widenOptions<Parameters<typeof createRouter>[0]>({
			routeTree,
			history,
			context: { queryClient },
		}),
	);

	return { router, history, queryClient, blockers };
};

const renderAt = async (
	initialUrl: string,
	options: { history?: 'memory' | 'browser' } = {},
) => {
	const harness = buildRouter(initialUrl, options);
	openHistories.push(harness.history);

	render(
		<QueryClientProvider client={harness.queryClient}>
			<RouterProvider router={harness.router} />
		</QueryClientProvider>,
	);
	await waitFor(() =>
		expect(
			screen.getByTestId('staff-tenant-profile-details-page'),
		).toBeTruthy(),
	);

	return harness;
};

const sectionLink = (pathname: string): HTMLAnchorElement => {
	const link = screen
		.getByTestId('staff-tenant-profile-tabs')
		.querySelector<HTMLAnchorElement>(`a[href^="${pathname}"]`);
	if (!link) {
		throw new Error(`no section nav link for ${pathname}`);
	}

	return link;
};

/** Types into the REAL edit drawer's real name field, which is what makes
 * `ProfileEditDetailsDrawer` report a dirty draft to the layout's guard. */
const dirtyTheEditDraft = async () => {
	const nameInput = await waitFor(() => {
		const input =
			document.querySelector<HTMLInputElement>('input[name="name"]');
		if (!input) {
			throw new Error('edit drawer name field not rendered');
		}

		return input;
	});
	fireEvent.change(nameInput, { target: { value: 'Renamed approvers' } });
	await waitFor(() => expect(nameInput.value).toBe('Renamed approvers'));
};

/** Dispatches a real cancelable `beforeunload` on the window — the same event
 * a tab close or reload fires — and reports whether anything cancelled it.
 * `@tanstack/history` attaches its handler with `capture: true`, so this
 * observes the actual registered listener, not a model of it. */
const dispatchBeforeUnload = (): boolean => {
	const event = new Event('beforeunload', { cancelable: true });
	window.dispatchEvent(event);

	return event.defaultPrevented;
};

/** Toggles a real permission checkbox in the real matrix, which is what makes
 * `ProfilePermissionsTab` report itself dirty to the layout's guard. */
const dirtyThePermissionMatrix = async () => {
	const row = await waitFor(() =>
		screen.getByTestId('permission-row-tenant.users.write'),
	);
	const checkbox = row.querySelector('button, input');
	if (!checkbox) {
		throw new Error('no permission checkbox to toggle');
	}
	fireEvent.click(checkbox);
	await waitFor(() => expect(row.getAttribute('data-changed')).toBe('true'));
};

describe('#977 tenant-profile sections are path segments (real router)', () => {
	beforeEach(() => {
		mocks.permissionKeys = ['tenant.users.read'];
	});

	afterEach(() => {
		cleanup();
		destroyOpenHistories();
		vi.clearAllMocks();
	});

	test('each of the three URLs resolves and renders its own section body', async () => {
		const overview = await renderAt(OVERVIEW_PATH);
		expect(
			screen.getByTestId('staff-tenant-profile-overview-content'),
		).toBeTruthy();
		expect(
			screen.queryByTestId('staff-tenant-profile-permissions-content'),
		).toBeNull();
		expect(overview.history.location.pathname).toBe(OVERVIEW_PATH);
		cleanup();

		await renderAt(PERMISSIONS_PATH);
		expect(
			screen.getByTestId('staff-tenant-profile-permissions-content'),
		).toBeTruthy();
		expect(
			screen.queryByTestId('staff-tenant-profile-overview-content'),
		).toBeNull();
		cleanup();

		await renderAt(MEMBERS_PATH);
		expect(
			screen.getByTestId('staff-tenant-profile-members-table'),
		).toBeTruthy();
		expect(
			screen.queryByTestId('staff-tenant-profile-overview-content'),
		).toBeNull();
	});

	test('the section nav links to real path segments, marks the current one, and keeps both count badges', async () => {
		await renderAt(PERMISSIONS_PATH);

		const nav = screen.getByTestId('staff-tenant-profile-tabs');
		expect(sectionLink(OVERVIEW_PATH).getAttribute('href')).toBe(OVERVIEW_PATH);
		expect(sectionLink(MEMBERS_PATH).getAttribute('href')).toBe(MEMBERS_PATH);
		// The active section is a static `aria-current` element, not a link.
		expect(nav.querySelector('[aria-current="page"]')?.textContent).toContain(
			'Permissions',
		);
		expect(nav.querySelector(`a[href="${PERMISSIONS_PATH}"]`)).toBeNull();

		// Count badges: 1 granted permission key, 7 member accounts.
		const badges = [...nav.querySelectorAll('.publy-profile-count-badge')].map(
			(badge) => badge.textContent,
		);
		expect(badges).toEqual(['1', '7']);
	});

	test('clicking through the sections changes the URL, and browser Back/Forward walks the same trail', async () => {
		const { history } = await renderAt(OVERVIEW_PATH);

		fireEvent.click(sectionLink(PERMISSIONS_PATH));
		await waitFor(() =>
			expect(history.location.pathname).toBe(PERMISSIONS_PATH),
		);
		expect(
			screen.getByTestId('staff-tenant-profile-permissions-content'),
		).toBeTruthy();

		fireEvent.click(sectionLink(MEMBERS_PATH));
		await waitFor(() => expect(history.location.pathname).toBe(MEMBERS_PATH));
		expect(
			screen.getByTestId('staff-tenant-profile-members-table'),
		).toBeTruthy();

		history.back();
		await waitFor(() =>
			expect(history.location.pathname).toBe(PERMISSIONS_PATH),
		);
		expect(
			screen.getByTestId('staff-tenant-profile-permissions-content'),
		).toBeTruthy();

		history.back();
		await waitFor(() => expect(history.location.pathname).toBe(OVERVIEW_PATH));
		expect(
			screen.getByTestId('staff-tenant-profile-overview-content'),
		).toBeTruthy();

		history.forward();
		await waitFor(() =>
			expect(history.location.pathname).toBe(PERMISSIONS_PATH),
		);
		expect(
			screen.getByTestId('staff-tenant-profile-permissions-content'),
		).toBeTruthy();
	});

	test('a legacy ?tab= deep link lands on the section path with the param gone', async () => {
		const { history } = await renderAt(`${OVERVIEW_PATH}?tab=members`);

		await waitFor(() => expect(history.location.pathname).toBe(MEMBERS_PATH));
		expect(history.location.href).not.toContain('tab=');
		expect(
			screen.getByTestId('staff-tenant-profile-members-table'),
		).toBeTruthy();
	});

	test('?edit=1 opens the edit drawer on every section, and the flag survives a section switch', async () => {
		const { history } = await renderAt(`${PERMISSIONS_PATH}?edit=1`);
		expect(screen.getByTestId('profile-edit-details-drawer')).toBeTruthy();

		fireEvent.click(sectionLink(MEMBERS_PATH));
		await waitFor(() => expect(history.location.pathname).toBe(MEMBERS_PATH));
		expect(
			new URL(history.location.href, 'http://localhost').searchParams.get(
				'edit',
			),
		).toBe('1');
		expect(screen.getByTestId('profile-edit-details-drawer')).toBeTruthy();
	});
});

/**
 * `shouldBlockFn` is a disjunction of independent clauses, and a test that
 * does not say which one it pins will silently be decided by a different one
 * (this file has already shipped two such false greens). The clauses:
 *
 *   A  isPermissionsMatrixDirty
 *   B  current.pathname === permissionsPathname
 *   C  next.pathname !== permissionsPathname
 *   D  isEditDrawerOpen
 *   E  isEditFormDirty
 *   F  editDrawerNavBypassRef.current
 *   G  isProfileSectionPathname(next.pathname)
 *   H  next.search.edit === 1
 *
 * Which case pins which, and each is proven by mutating exactly that clause:
 *
 *   case 1/2/3  C in the blocking direction (A and B held true)
 *   case 4      C in the NON-blocking direction. Its drawer arm short-circuits
 *               on E, so it says nothing about G or H — hence case 7.
 *   case 5/6    G in the exclusion direction (a non-section must not count)
 *   case 7      G in the inclusion direction (a real section must count)
 *   case 8      H (G held true, so only H can decide)
 *
 * A, B, D, E and F are pinned in `$profileId.test.tsx`, which drives the same
 * production `shouldBlockFn` directly: the matrix-dirty test (A), the stale-
 * flag test (B), "never blocks when the drawer is closed" (D), "only blocks
 * while the drawer is open AND dirty" (E) and the W8-DRAWER bypass test (F).
 * Nothing here re-proves them. Between the two files every clause above is
 * pinned by exactly one case — if you add a clause, add its case.
 */
describe('#977 the dirty-matrix navigation guard (real router)', () => {
	beforeEach(() => {
		mocks.permissionKeys = ['tenant.users.read'];
	});

	afterEach(() => {
		cleanup();
		destroyOpenHistories();
		vi.clearAllMocks();
	});

	test('case 1 — a section switch away from a dirty Permissions matrix is blocked, and the URL does not move until confirmed', async () => {
		const { history } = await renderAt(PERMISSIONS_PATH);
		await dirtyThePermissionMatrix();

		fireEvent.click(sectionLink(OVERVIEW_PATH));

		await waitFor(() =>
			expect(screen.getByText('Leave without saving?')).toBeTruthy(),
		);
		expect(history.location.pathname).toBe(PERMISSIONS_PATH);
		expect(
			screen.getByTestId('staff-tenant-profile-permissions-content'),
		).toBeTruthy();

		fireEvent.click(screen.getByRole('button', { name: 'Leave page' }));
		await waitFor(() => expect(history.location.pathname).toBe(OVERVIEW_PATH));
	});

	test('case 2 — a sibling-route navigation away from a dirty matrix is blocked', async () => {
		const { history } = await renderAt(PERMISSIONS_PATH);
		await dirtyThePermissionMatrix();

		const backLink = document.querySelector<HTMLAnchorElement>(
			`a.publy-back-link[href="${PROFILES_LIST_PATH}"]`,
		);
		if (!backLink) {
			throw new Error('no back-to-profiles link');
		}
		fireEvent.click(backLink);

		await waitFor(() =>
			expect(screen.getByText('Leave without saving?')).toBeTruthy(),
		);
		expect(history.location.pathname).toBe(PERMISSIONS_PATH);
		expect(screen.queryByTestId('profiles-list-page')).toBeNull();
	});

	/**
	 * Case 3 — browser Back.
	 *
	 * `createMemoryHistory().back()` short-circuits the blocker list: only
	 * PUSH/REPLACE consult blockers in `@tanstack/history`'s `tryNavigation`,
	 * while a real browser's Back is intercepted by `createBrowserHistory`'s
	 * own popstate handler, which DOES consult them. That interception is the
	 * history package's code, not this repo's, and it is unreachable from
	 * jsdom's memory history.
	 *
	 * What IS this repo's code — and what this test drives — is the predicate
	 * the browser handler would call: the exact blocker object the production
	 * `useBlocker` registered on the real router's history (captured at
	 * `history.block` time, not re-implemented), invoked with `action: 'BACK'`
	 * and the real current/previous locations. A blocked result resolves
	 * through the real `withResolver` machinery, so the assertion below is on
	 * the user-visible prompt, not on a boolean.
	 *
	 * Stated plainly so the name is not read as more than it is: the predicate
	 * never inspects `action`, so this pins clause C exactly as cases 1 and 2
	 * do — what it adds is that the BACK entry point reaches the same verdict,
	 * not that a distinct clause fires for it.
	 */
	test('case 3 — a browser Back away from a dirty matrix is blocked', async () => {
		const { history, blockers } = await renderAt(OVERVIEW_PATH);

		fireEvent.click(sectionLink(PERMISSIONS_PATH));
		await waitFor(() =>
			expect(history.location.pathname).toBe(PERMISSIONS_PATH),
		);
		await dirtyThePermissionMatrix();

		expect(blockers.length).toBeGreaterThan(0);
		const asHistoryLocation = (pathname: string) => ({
			href: pathname,
			pathname,
			// `useBlocker` feeds this straight to `router.options.parseSearch`,
			// which takes the raw search STRING off a history location.
			search: '',
			hash: '',
			// BlockerFnArgs.state is ParsedHistoryState; the production
			// predicate never inspects it, but TanStack's own shape carries the
			// render index, so mirror what a real history location has.
			state: { __TSR_index: 0 },
		});
		const blocked = blockers.map((blockerFn) =>
			blockerFn({
				currentLocation: asHistoryLocation(PERMISSIONS_PATH),
				nextLocation: asHistoryLocation(OVERVIEW_PATH),
				action: 'BACK',
			}),
		);

		await waitFor(() =>
			expect(screen.getByText('Leave without saving?')).toBeTruthy(),
		);
		fireEvent.click(screen.getByRole('button', { name: 'Leave page' }));
		await expect(Promise.all(blocked)).resolves.toContain(false);
	});

	/**
	 * Pins clause C in its non-blocking direction: a search-only change keeps
	 * `next.pathname` equal to `permissionsPathname`, so the dirty matrix must
	 * not prompt.
	 *
	 * It deliberately does NOT pin the drawer arm. With the form clean, E is
	 * false and `shouldBlockFn` returns at the early guard before
	 * `staysOnOpenDrawer` — so G and H are never consulted here, and this case
	 * stays green under any mutation of them. Case 7 covers that direction.
	 */
	test('case 4 — a search-only change on the same section does not trip the dirty-matrix guard', async () => {
		const { history } = await renderAt(PERMISSIONS_PATH);
		await dirtyThePermissionMatrix();

		fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
		await waitFor(() =>
			expect(screen.getByTestId('profile-edit-details-drawer')).toBeTruthy(),
		);
		expect(screen.queryByText('Leave without saving?')).toBeNull();
		expect(history.location.pathname).toBe(PERMISSIONS_PATH);
		expect(
			new URL(history.location.href, 'http://localhost').searchParams.get(
				'edit',
			),
		).toBe('1');

		// Closing again is the mirror-image case (`?edit=1` dropped, same
		// pathname) and must be just as silent.
		fireEvent.keyDown(document.body, { key: 'Escape' });
		await waitFor(() =>
			expect(
				new URL(history.location.href, 'http://localhost').searchParams.has(
					'edit',
				),
			).toBe(false),
		);
		expect(screen.queryByText('Leave without saving?')).toBeNull();
		expect(history.location.pathname).toBe(PERMISSIONS_PATH);
	});

	/**
	 * The two sibling routes that live under this profile's path prefix but
	 * are NOT children of the layout. Navigating to either unmounts the
	 * layout — and with it the open drawer and its draft — so both must be
	 * blocked. Both are the real production route objects, so this drives the
	 * real unmount and, for `/edit`, the real `beforeLoad` redirect.
	 *
	 * Both navigations below deliberately PRESERVE the current search
	 * (`search: (previous) => previous`) — the exact shape every in-app
	 * section link in this slice already uses. That matters: with the search
	 * carried over, `next.search.edit === 1` is satisfied, so
	 * `isProfileSectionPathname` is the ONLY thing left deciding whether the
	 * drawer survives. Navigating without the search would be blocked by the
	 * `edit === 1` clause no matter how the pathname were classified, which
	 * is what let a `/edit`-misclassification mutation pass unnoticed.
	 *
	 * `/edit` is the dangerous one: its `beforeLoad` bounces straight back to
	 * `?edit=1` on the layout, so a misclassification looks harmless — you
	 * land on the drawer again — while having silently thrown the draft away
	 * in between.
	 */
	test('case 5 — navigating to the flat /users sibling with a dirty draft is blocked', async () => {
		const { router, history } = await renderAt(`${OVERVIEW_PATH}?edit=1`);
		await dirtyTheEditDraft();

		void router.navigate({
			to: '/staff/tenants/$tenantId/profiles/$profileId/users',
			params: { tenantId: TENANT_ID, profileId: PROFILE_ID },
			search: (previous: Record<string, unknown>) => previous,
		});

		await waitFor(() =>
			expect(screen.getByText('Leave without saving?')).toBeTruthy(),
		);
		expect(history.location.pathname).toBe(OVERVIEW_PATH);
		expect(screen.getByTestId('profile-edit-details-drawer')).toBeTruthy();

		fireEvent.click(screen.getByRole('button', { name: 'Leave page' }));
		await waitFor(() =>
			expect(history.location.pathname).toBe(`${OVERVIEW_PATH}/users`),
		);
	});

	test('case 6 — navigating to the /edit redirect shim with a dirty draft is blocked before the layout unmounts', async () => {
		const { router, history } = await renderAt(`${OVERVIEW_PATH}?edit=1`);
		await dirtyTheEditDraft();

		void router.navigate({
			to: '/staff/tenants/$tenantId/profiles/$profileId/edit',
			params: { tenantId: TENANT_ID, profileId: PROFILE_ID },
			search: (previous: Record<string, unknown>) => previous,
		});

		await waitFor(() =>
			expect(screen.getByText('Leave without saving?')).toBeTruthy(),
		);
		// Still on the layout, drawer still mounted, draft still in the field.
		expect(history.location.pathname).toBe(OVERVIEW_PATH);
		expect(
			document.querySelector<HTMLInputElement>('input[name="name"]')?.value,
		).toBe('Renamed approvers');
	});

	/**
	 * The inclusion direction of clause G, and the mirror image of cases 5/6:
	 * a genuine section pathname MUST count as staying on the drawer, or every
	 * section switch with a dirty draft raises a prompt for work that was
	 * never at risk — the drawer is hosted by the layout and survives.
	 *
	 * With A false (no matrix staged) and B false (not starting on
	 * Permissions), the matrix arm is inert, and D/E/F are all satisfied, so
	 * `staysOnOpenDrawer` is the only thing left — and H holds because the
	 * search is carried over. G is therefore the deciding clause.
	 *
	 * Driven through `router.navigate` rather than a nav-link click: with the
	 * drawer open the nav is behind a modal backdrop, so clicking it would be
	 * staging an interaction a user cannot actually perform. The transition
	 * itself (browser Back/Forward, or a future in-drawer link) is real.
	 */
	test('case 7 — a section switch with a dirty draft is allowed, and the draft survives it', async () => {
		const { router, history } = await renderAt(`${OVERVIEW_PATH}?edit=1`);
		await dirtyTheEditDraft();

		void router.navigate({
			to: '/staff/tenants/$tenantId/profiles/$profileId/permissions',
			params: { tenantId: TENANT_ID, profileId: PROFILE_ID },
			search: (previous: Record<string, unknown>) => previous,
		});

		// Settle on either outcome — landed, or prompted — so a regression
		// reports the spurious prompt rather than timing out and printing two
		// truncated pathnames.
		await waitFor(() => {
			const settled =
				history.location.pathname === PERMISSIONS_PATH ||
				screen.queryByText('Leave without saving?') !== null;
			expect(settled).toBe(true);
		});

		expect(
			screen.queryByText('Leave without saving?'),
			'a section switch keeps this layout — and the open drawer with it — mounted, so no work is at risk and the guard must not prompt; clause G must count a real section pathname as staying on the drawer',
		).toBeNull();
		expect(history.location.pathname).toBe(PERMISSIONS_PATH);
		expect(screen.getByTestId('profile-edit-details-drawer')).toBeTruthy();
		expect(
			document.querySelector<HTMLInputElement>('input[name="name"]')?.value,
		).toBe('Renamed approvers');
	});

	/**
	 * Clause H. Same start as case 7, but the navigation DROPS `?edit=1`, so
	 * the drawer closes and the draft goes with it even though the pathname is
	 * a real section. G holds here; only H can produce the block.
	 */
	test('case 8 — a section switch that drops ?edit closes the drawer, so a dirty draft is blocked', async () => {
		const { router, history } = await renderAt(`${OVERVIEW_PATH}?edit=1`);
		await dirtyTheEditDraft();

		void router.navigate({
			to: '/staff/tenants/$tenantId/profiles/$profileId/permissions',
			params: { tenantId: TENANT_ID, profileId: PROFILE_ID },
		});

		await waitFor(() =>
			expect(screen.getByText('Leave without saving?')).toBeTruthy(),
		);
		expect(history.location.pathname).toBe(OVERVIEW_PATH);
		expect(
			document.querySelector<HTMLInputElement>('input[name="name"]')?.value,
		).toBe('Renamed approvers');
	});
});

/**
 * `useBlocker` defaults `enableBeforeUnload` to `true`, which arms the
 * browser's native leave-site prompt for the route's whole lifetime. These
 * tests observe the REAL `beforeunload` event on the window — memory history
 * never registers that listener, so they run on the real browser history over
 * jsdom — and assert on `defaultPrevented`, not on which option value was
 * passed in.
 */
describe('#977 the native leave-site prompt is armed only when work would be lost', () => {
	beforeEach(() => {
		mocks.permissionKeys = ['tenant.users.read'];
	});

	afterEach(() => {
		cleanup();
		destroyOpenHistories();
		vi.clearAllMocks();
	});

	test('a clean Overview page does not cancel beforeunload', async () => {
		await renderAt(OVERVIEW_PATH, { history: 'browser' });

		expect(dispatchBeforeUnload()).toBe(false);
	});

	test('a clean Permissions page does not cancel beforeunload', async () => {
		await renderAt(PERMISSIONS_PATH, { history: 'browser' });
		await waitFor(() =>
			expect(
				screen.getByTestId('permission-row-tenant.users.write'),
			).toBeTruthy(),
		);

		expect(dispatchBeforeUnload()).toBe(false);
	});

	test('a dirty permission matrix cancels beforeunload, and stops once the edit is reverted', async () => {
		await renderAt(PERMISSIONS_PATH, { history: 'browser' });
		await dirtyThePermissionMatrix();

		expect(dispatchBeforeUnload()).toBe(true);

		// Toggling back to the saved state is no longer unsaved work.
		const row = screen.getByTestId('permission-row-tenant.users.write');
		const checkbox = row.querySelector('button, input');
		if (!checkbox) {
			throw new Error('no permission checkbox to toggle');
		}
		fireEvent.click(checkbox);
		await waitFor(() => expect(row.getAttribute('data-changed')).toBeNull());

		expect(dispatchBeforeUnload()).toBe(false);
	});

	test('an open-but-clean edit drawer does not cancel beforeunload; a dirty draft does', async () => {
		await renderAt(`${OVERVIEW_PATH}?edit=1`, { history: 'browser' });
		await waitFor(() =>
			expect(screen.getByTestId('profile-edit-details-drawer')).toBeTruthy(),
		);

		expect(dispatchBeforeUnload()).toBe(false);

		await dirtyTheEditDraft();
		expect(dispatchBeforeUnload()).toBe(true);
	});
});
