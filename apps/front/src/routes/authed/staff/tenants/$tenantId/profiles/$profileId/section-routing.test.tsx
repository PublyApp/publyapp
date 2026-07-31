/** @vitest-environment jsdom */
/**
 * #977 Tier-2 guard: the tenant-profile detail sections as REAL path
 * segments, driven through a REAL TanStack router.
 *
 * What is real here:
 *  - the four production route objects themselves (`$profileId.tsx`,
 *    `$profileId/index.tsx`, `/permissions`, `/members`) — imported and
 *    `.update()`-ed onto a throwaway parent exactly the way `routeTree.gen`
 *    wires them, so their real ids, paths, `staticData`, `validateSearch`,
 *    `beforeLoad` and `component` are the ones under test. Nothing is
 *    re-declared or copied.
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
 * `breadcrumb-contract.test.tsx` guard B): mounting the whole 48-route app
 * would drag in session/auth bootstrapping that has nothing to do with the
 * thing being proved.
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
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

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
	} as Record<string, unknown>,
	profileDetails: {
		profile: {
			id: '22222222-2222-2222-2222-222222222222',
			name: 'Approvers',
			description: 'Can review approvals',
			isDefault: false,
			userAccountCount: 7,
		},
	} as Record<string, unknown>,
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
	} as Record<string, unknown>,
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
	};
});

vi.mock('~/lib/query/staff-tenant-profiles', async (importOriginal) => {
	const actual =
		await importOriginal<typeof import('~/lib/query/staff-tenant-profiles')>();

	return {
		...actual,
		useStaffTenantProfileDetailsQuery: () => settledQuery(mocks.profileDetails),
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
			const labels: Record<string, string> = {
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
import { Route as ProfileOverviewRoute } from './index';
import { Route as ProfileMembersRoute } from './members';
import { Route as ProfilePermissionsRoute } from './permissions';

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
	(route as { update: (options: unknown) => unknown }).update(options);

	return route;
};

type BlockerRegistration = {
	blockerFn: (args: {
		currentLocation: Record<string, unknown>;
		nextLocation: Record<string, unknown>;
		action: string;
	}) => Promise<boolean>;
};

const buildRouter = (initialUrl: string) => {
	const rootRoute = createRootRoute({
		staticData: { crumbs: 'shell' },
		component: () => <Outlet />,
	});
	const layoutRoute = createRoute({
		getParentRoute: () => rootRoute,
		id: '/_authed-layout',
		staticData: { crumbs: 'shell' },
		component: () => <Outlet />,
	} as never);
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
	// Two real sibling destinations that are NOT children of the layout — the
	// profiles list (where "Back to …" and a successful delete go) and the
	// flat `/users` route. Navigating to either unmounts the layout.
	const profilesListRoute = createRoute({
		getParentRoute: () => layoutRoute,
		path: '/staff/tenants/$tenantId/profiles',
		staticData: { crumbs: 'shell' },
		component: () => <div data-testid="profiles-list-page" />,
	} as never);

	const routeTree = (
		rootRoute as unknown as {
			addChildren: (children: unknown[]) => unknown;
		}
	).addChildren([
		(
			layoutRoute as unknown as {
				addChildren: (children: unknown[]) => unknown;
			}
		).addChildren([
			(
				detailsRoute as unknown as {
					addChildren: (children: unknown[]) => unknown;
				}
			).addChildren([overviewRoute, permissionsRoute, membersRoute]),
			profilesListRoute,
		]),
	]);

	const history = createMemoryHistory({ initialEntries: [initialUrl] });
	// The blockers array inside `createHistory` is closed over, so capture
	// every registration as it happens. This is the SAME object the router
	// hands to `useBlocker`; nothing about the production predicate is
	// re-implemented here.
	const blockers: BlockerRegistration[] = [];
	const originalBlock = history.block.bind(history);
	history.block = ((registration: BlockerRegistration) => {
		blockers.push(registration);

		return originalBlock(registration as never);
	}) as unknown as typeof history.block;

	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	const router = createRouter({
		routeTree,
		history,
		context: { queryClient },
	} as never);

	return { router, history, queryClient, blockers };
};

const renderAt = async (initialUrl: string) => {
	const harness = buildRouter(initialUrl);

	render(
		<QueryClientProvider client={harness.queryClient}>
			<RouterProvider router={harness.router as never} />
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

describe('#977 the dirty-matrix navigation guard (real router)', () => {
	beforeEach(() => {
		mocks.permissionKeys = ['tenant.users.read'];
	});

	afterEach(() => {
		cleanup();
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
			state: {},
		});
		const blocked = blockers.map((registration) =>
			registration.blockerFn({
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

	test('case 4 — opening and closing the edit drawer on the same section never prompts', async () => {
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
});
