/** @vitest-environment jsdom */
/**
 * #1388 Partie B: the staff profile "users" tab offers row selection but no
 * bulk management action, even though the API now ships
 * `POST /staff/profiles/{profileId}/users/unassign` with the repo-standard
 * partial-success contract.
 *
 * Why real-router (repo precedent `staff-users-bulk-routing.test.tsx`): the
 * issue's complaint is about what the ROUTE actually renders in selection
 * mode. The production failure mode lives in the seam between the page
 * component, the shared `FloatingSelectionBar`, and the toolbar children — a
 * mocked page cannot see it.
 *
 * What is real here:
 *  - the REAL `$profileId/users` route object (same module identity, mounted
 *    via `.update()` the way `routeTree.gen` wires it), its real `component`;
 *  - a real `createRouter` + `createMemoryHistory`, so the route resolves and
 *    renders exactly as in production;
 *  - real user interactions driving the bulk-unassign flow through the real
 *    route component into the confirm dialog.
 *
 * What is faked: only the network-facing surface — the `~/lib/query/*`
 * data hooks and i18n strings. Nothing about the toolbar, the
 * selection model, or the bulk-action flow is re-implemented here.
 *
 * #1442: `shouldLogoutForFailure` is NO LONGER hard-mocked here — the real
 * failure helper classifies every rejection these tests drive. Only the
 * toast surface (sonner) and the server-action-bearing logout redirect stay
 * mocked at the seam, so the 401/logout path below runs through production
 * classification code end to end.
 *
 * Post-success bookkeeping (#1407-class contract): the success path's
 * `clearSelection` + `invalidateStaffProfiles` are asserted against LIVE
 * behavior, not call logs — the invalidation spy delegates to the production
 * helper running over the harness's real `QueryClient`, so the test fails if
 * the list stops being invalidated.
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
import type { AnyRouter } from '@tanstack/react-router';
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { scopedKey } from '@org/shared-ts/lib/query/create-hooks';

const USER_A = '11111111-1111-1111-1111-111111111111';
const USER_B = '22222222-2222-2222-2222-222222222222';
const PAGE_ROUTE_PATH = '/staff/profiles/profile-1/users';

const mocks = vi.hoisted(() => ({
	useDetailsQuery: vi.fn(),
	useUsersQuery: vi.fn(),
	toRows: vi.fn(),
	useBulkUnassign: vi.fn(),
	bulkUnassign: vi.fn(),
	toastSuccess: vi.fn(),
	toastWarning: vi.fn(),
	toastError: vi.fn(),
	invalidateStaffProfiles: vi.fn().mockResolvedValue(undefined),
}));

// #1442: the toast surface is mocked at the seam (sonner), so the REAL
// `~/lib/mutation-toast` adapter (and its real `displayLocalMutationFailure`
// classification) runs underneath and the assertions below observe exactly
// what production would raise.
vi.mock('sonner', () => ({
	toast: Object.assign(vi.fn(), {
		success: mocks.toastSuccess,
		warning: mocks.toastWarning,
		error: mocks.toastError,
	}),
}));

vi.mock('~/lib/query/staff-profile-users', () => ({
	toStaffProfileUserRows: mocks.toRows,
	useStaffProfileUsersQuery: mocks.useUsersQuery,
	useBulkUnassignStaffProfileUsersMutation: mocks.useBulkUnassign,
}));

vi.mock('~/lib/query/staff-profiles', async (importOriginal) => {
	const actual =
		await importOriginal<typeof import('~/lib/query/staff-profiles')>();

	// The spy stays a spy (call-count assertions) but delegates to the REAL
	// invalidation helper so the post-success test exercises production
	// invalidation semantics against the harness's real QueryClient.
	mocks.invalidateStaffProfiles.mockImplementation((queryClient: QueryClient) =>
		actual.invalidateStaffProfiles(queryClient),
	);

	return {
		STAFF_PROFILES_QUERY_KEY: ['staff-profiles'],
		invalidateStaffProfiles: mocks.invalidateStaffProfiles,
		selectStaffProfileCrumbName: () => undefined,
		staffProfileCrumbQuery: () => ({
			queryKey: ['crumb'],
			queryFn: () => Promise.resolve(null),
		}),
		toStaffProfileDetails: (
			data: { id: string; name: string; userAccountCount: number } | undefined,
		) => data ?? null,
		useStaffProfileDetailsQuery: mocks.useDetailsQuery,
	};
});

// #1442: LogoutRedirect fires the session-clearing SERVER ACTION plus a
// cross-history navigation — start-server seams outside this suite's scope.
// Mocking it keeps the pin on the ROUTE's decision (a 401-class rejection
// must swap the page for the central logout redirect).
vi.mock('~/components/error-views/LogoutRedirect', () => ({
	LogoutRedirect: () => <div data-testid="logout-redirect">logout</div>,
}));

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string, options?: Record<string, unknown>) => {
			const bare = key.includes(':')
				? (key.split(':').slice(1).join(':') ?? key)
				: key;
			const labels: TestLabelMap = {
				name: 'Name',
				status: 'Status',
				users: 'Users',
				basics: 'Basics',
				search: 'Search',
				'staff-profile': 'Staff profile',
				'clear-selection': 'Clear selection',
				'more-actions': 'More actions',
				'bulk-actions': 'Bulk actions',
				'bulk-unassign': 'Unassign selected',
				unassign: 'Unassign',
				confirm: 'Confirm',
				cancel: 'Cancel',
				'select-all-visible': 'Select all {{count}}',
				'row-selection-column': 'Select row',
				'select-row-named': 'Select {{name}}',
				'search-staff-profile-users': 'Search assigned users',
				'no-email-address': 'No email address',
				'status-active': 'Active',
				'status-suspended': 'Suspended',
				'status-unknown': 'Unknown',
				'assigned-users': 'Assigned users',
				'assigned-users-for-this-staff-profile':
					'Users assigned to this staff profile.',
				'staff-profile-sections': 'Staff profile sections',
				'assigned-staff-profile-users': 'Assigned staff profile users',
				'staff-profile-users-description':
					'Users assigned to this staff profile.',
				'no-users-assigned-to-profile': 'No users assigned to this profile.',
				'no-assigned-users-match-search': 'No assigned users match search.',
				'back-to-staff-profiles': 'Back to staff profiles',
				'bulk-unassign-staff-profile-users-confirm':
					'Are you sure you want to unassign {{count}} user(s) from this profile?',
				'staff-profile-user-bulk-unassign-partial-success':
					'Unassigned {{succeeded}} user(s), {{failed}} failed.',
				'bulk-unassign-failed-item-not-assigned':
					'this user is not assigned to this profile.',
				'bulk-unassign-failed-item-not-found':
					'this user does not exist or is not a staff member.',
				'bulk-unassign-no-eligible-users':
					'Select at least one user to unassign.',
			};

			return (labels[bare] ?? bare).replace(
				/\{\{(\w+)\}\}/g,
				(_, name: string) => String(options?.[name] ?? ''),
			);
		},
		i18n: { language: 'en' },
	}),
}));

import type { TestLabelMap } from '~/lib/testing/test-label-map';
import { chooseBulkAction } from '~/test-helpers/choose-bulk-action';

import { Route as ProfileUsersRoute } from './users';

const settledQuery = (data: unknown) => ({
	data,
	error: null,
	isPending: false,
	isError: false,
	isError_: false,
	isFetching: false,
	refetch: () => Promise.resolve(),
});

const usersPayload = () => ({
	users: [
		{
			id: USER_A,
			email: 'alex@example.com',
			firstName: 'Alex',
			lastName: 'User',
			avatarUrl: null,
			status: 'Active',
		},
		{
			id: USER_B,
			email: 'blake@example.com',
			firstName: 'Blake',
			lastName: 'Row',
			avatarUrl: null,
			status: 'Active',
		},
	],
	count: 2,
});

/**
 * Production users-list cache key for this page (scope prefix via the shared
 * `scopedKey` helper; inner segments mirror staff-profile-users.ts's
 * `queryKeyFn`). Seeding a real entry under this key makes a subsequent
 * `getQueryState(key).isInvalidated` read meaningful instead of vacuous.
 */
const usersListCacheKey = () => [
	...scopedKey('staff', ['staff-profiles', 'users']),
	{
		profileId: 'profile-1',
		q: '',
		sortId: 'created_at',
		sortOrder: 'desc',
		pageIndex: 0,
		size: 100,
	},
];

/**
 * `createFileRoute(...)(options)` does not attach id/path/parent — the
 * generated `routeTree.gen.ts` does, with exactly this `.update()` call.
 * Same harness precedent as `staff-users-bulk-routing.test.tsx`.
 */
const widenOptions = <T,>(value: unknown): T => {
	return value as T;
};
const mountRealRoute = <TRoute,>(
	route: TRoute,
	options: Record<string, unknown>,
): TRoute => {
	widenOptions<{ update: (options: Record<string, unknown>) => void }>(
		route,
	).update(options);

	return route;
};

const openHistories: { destroy: () => void }[] = [];

const destroyOpenHistories = (): void => {
	while (openHistories.length > 0) {
		openHistories.pop()?.destroy();
	}
};

const buildHarness = () => {
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
	const pageRoute = mountRealRoute(ProfileUsersRoute, {
		path: '/staff/profiles/$profileId/users',
		getParentRoute: () => layoutRoute,
	});

	const addChildrenOf = (route: unknown) => {
		return widenOptions<{ addChildren: (children: unknown[]) => void }>(route)
			.addChildren;
	};
	const routeTree = addChildrenOf(rootRoute)([
		addChildrenOf(layoutRoute)([pageRoute]),
	]);

	const history = createMemoryHistory({
		initialEntries: [PAGE_ROUTE_PATH],
	});
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

	return { router, history, queryClient };
};

const renderAtPage = async () => {
	const harness = buildHarness();
	openHistories.push(harness.history);

	render(
		<QueryClientProvider client={harness.queryClient}>
			<RouterProvider router={harness.router} />
		</QueryClientProvider>,
	);
	await waitFor(() =>
		expect(screen.getByTestId('staff-profile-users-table')).toBeTruthy(),
	);
	await waitFor(() => expect(screen.getByText('Alex User')).toBeTruthy());

	return harness;
};

describe('#1388 profile users selection-mode bulk unassign (real router)', () => {
	beforeEach(() => {
		vi.clearAllMocks();

		mocks.toRows.mockImplementation(
			(
				items:
					| Array<{
							id: string;
							email: string;
							firstName: string | null;
							lastName: string | null;
							status: string | null;
					  }>
					| null
					| undefined,
			) =>
				(items ?? []).map((item) => ({
					id: item.id,
					email: item.email,
					firstName: item.firstName,
					lastName: item.lastName,
					avatarUrl: null,
					status: item.status,
				})),
		);
		mocks.useDetailsQuery.mockImplementation(() =>
			settledQuery({
				id: 'profile-1',
				name: 'Billing',
				userAccountCount: 2,
			}),
		);
		mocks.useUsersQuery.mockImplementation(() => settledQuery(usersPayload()));
		mocks.useBulkUnassign.mockReturnValue({
			mutateAsync: mocks.bulkUnassign,
			isPending: false,
		});
		mocks.bulkUnassign.mockResolvedValue({
			succeededCount: 1,
			failedCount: 0,
			failedItems: [],
		});
	});

	afterEach(() => {
		cleanup();
		destroyOpenHistories();
		vi.clearAllMocks();
	});

	// THE issue complaint: selection mode offers no way to unassign the
	// selected users from this profile.
	test('selection mode exposes the Unassign selected action', async () => {
		await renderAtPage();

		fireEvent.click(screen.getByRole('checkbox', { name: `Select ${USER_A}` }));

		const trigger = await screen.findByRole('button', {
			name: 'More actions',
			expanded: false,
		});
		fireEvent.click(trigger);
		await waitFor(() =>
			expect(trigger.getAttribute('aria-expanded')).toBe('true'),
		);

		expect(
			screen.getByRole('menuitem', { name: 'Unassign selected' }),
		).toBeTruthy();
	});

	test('a confirmed unassign drives the real route component into the bulk mutation', async () => {
		await renderAtPage();

		fireEvent.click(screen.getByRole('checkbox', { name: `Select ${USER_A}` }));

		await chooseBulkAction('Unassign selected', 'More actions');

		// Destructive action requires confirmation before firing.
		expect(
			await screen.findByText(
				'Are you sure you want to unassign 1 user(s) from this profile?',
			),
		).toBeTruthy();
		fireEvent.click(screen.getByRole('button', { name: 'Unassign' }));

		await waitFor(() => expect(mocks.bulkUnassign).toHaveBeenCalledOnce());
		expect(mocks.bulkUnassign).toHaveBeenCalledWith({
			profileId: 'profile-1',
			userIds: [USER_A],
		});
		await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledOnce());
		// #1605: the filter-leave warning accompanies the success toast.
		await waitFor(() =>
			expect(mocks.toastSuccess).toHaveBeenCalledWith(
				'staff-profile-user-bulk-unassign-success',
				{ description: 'bulk-action-rows-may-leave-filter' },
			),
		);
	});

	// Round-4 pin (PR #1413 review MAJOR): the FULLY-FAILED edge (succeeded =
	// 0, failed ≥ 1) runs the SAME unconditional post-mutation bookkeeping as
	// every other 200 shape. The #820 spec states the contract with no
	// succeeded>0 exception ("success clears selection, invalidates via
	// `invalidateStaffUsers`, toasts success or partial-success with counts"),
	// and the sibling invitations flow pins all three shapes identically
	// (invitations-bulk-revoke-routing.test.tsx — its comment records that
	// leaving the all-failure shape out of the pinned paths is exactly what
	// let a "skip invalidation unless succeededCount > 0" mutant survive).
	// This kills the round-3 self-chosen survivor gating `clearSelection` +
	// `invalidateStaffProfiles` behind `if (succeededCount > 0)`: that mutant
	// leaves the checked box checked and the cache entry fresh here.
	test('a fully-failed unassign still clears the selection, invalidates the list, and surfaces the failure counts', async () => {
		mocks.bulkUnassign.mockResolvedValue({
			succeededCount: 0,
			failedCount: 1,
			failedItems: [{ userId: USER_A, reason: 'not_assigned' }],
		});

		const harness = await renderAtPage();

		// Seed a REAL cache entry under the production users-list key so the
		// post-response `isInvalidated` read below is meaningful, not vacuous.
		const usersListKey = usersListCacheKey();
		harness.queryClient.setQueryData(usersListKey, { users: [], count: 0 });
		expect(
			harness.queryClient.getQueryState(usersListKey)?.isInvalidated ?? false,
		).toBe(false);

		fireEvent.click(screen.getByRole('checkbox', { name: `Select ${USER_A}` }));
		await waitFor(() =>
			expect(
				screen
					.getByRole('checkbox', { name: `Select ${USER_A}` })
					.getAttribute('aria-checked'),
			).toBe('true'),
		);

		await chooseBulkAction('Unassign selected', 'More actions');
		fireEvent.click(await screen.findByRole('button', { name: 'Unassign' }));

		// Fully-failed takes the error-toast path, never plain success, and
		// carries the per-row cause in plain words beside the counts.
		await waitFor(() => expect(mocks.bulkUnassign).toHaveBeenCalledOnce());
		await waitFor(() => expect(mocks.toastError).toHaveBeenCalledOnce());
		expect(mocks.toastSuccess).not.toHaveBeenCalled();
		await waitFor(() =>
			expect(mocks.toastError).toHaveBeenCalledWith(
				'Unassigned 0 user(s), 1 failed.',
				{
					description: 'Alex User: this user is not assigned to this profile.',
				},
			),
		);
		// #1605: total failure (succeededCount === 0) suppresses the
		// filter-leave warning -- assert the second arg carries the per-row
		// cause ONLY, no filter hint.
		expect(mocks.toastError.mock.calls[0][1]?.description).not.toContain(
			'bulk-action-rows-may-leave-filter',
		);

		// (a) Bookkeeping is UNCONDITIONAL even when NOTHING succeeded: the row
		// checkbox unchecks and the selection bar unmounts.
		await waitFor(() =>
			expect(
				screen
					.getByRole('checkbox', { name: `Select ${USER_A}` })
					.getAttribute('aria-checked'),
			).toBe('false'),
		);
		await waitFor(() =>
			expect(
				screen.queryByRole('button', { name: 'Clear selection' }),
			).toBeNull(),
		);

		// (b) ...and the profile users list went through the REAL invalidation
		// helper over the harness's QueryClient.
		await waitFor(() => {
			expect(mocks.invalidateStaffProfiles).toHaveBeenCalledOnce();
			expect(
				harness.queryClient.getQueryState(usersListKey)?.isInvalidated ?? false,
			).toBe(true);
		});
	});

	// #1814: the fully-failed edge WITHOUT per-item reasons (failedItems: [])
	// exercises the `succeededCount > 0` guard directly — reasons.length === 0
	// falls back to filterWarning, which is undefined when succeededCount === 0.
	// The older fully-failed test above carries a non-empty failedItems, so it
	// takes the per-row cause branch and never evaluates the guard at zero.
	// #1811: the expected behavior here (failure count with no cause) is
	// tracked separately; this test covers the CURRENT behavior only.
	test('a fully-failed unassign without per-item reasons suppresses the filter-leave warning', async () => {
		mocks.bulkUnassign.mockResolvedValue({
			succeededCount: 0,
			failedCount: 1,
			failedItems: [],
		});

		const harness = await renderAtPage();

		const usersListKey = usersListCacheKey();
		harness.queryClient.setQueryData(usersListKey, { users: [], count: 0 });
		expect(
			harness.queryClient.getQueryState(usersListKey)?.isInvalidated ?? false,
		).toBe(false);

		fireEvent.click(screen.getByRole('checkbox', { name: `Select ${USER_A}` }));
		await waitFor(() =>
			expect(
				screen
					.getByRole('checkbox', { name: `Select ${USER_A}` })
					.getAttribute('aria-checked'),
			).toBe('true'),
		);

		await chooseBulkAction('Unassign selected', 'More actions');
		fireEvent.click(await screen.findByRole('button', { name: 'Unassign' }));

		await waitFor(() => expect(mocks.bulkUnassign).toHaveBeenCalledOnce());
		await waitFor(() => expect(mocks.toastError).toHaveBeenCalledOnce());
		expect(mocks.toastSuccess).not.toHaveBeenCalled();
		// reasons.length === 0 falls back to filterWarning, which is undefined
		// when succeededCount === 0 — the filter-leave warning is suppressed.
		expect(mocks.toastError.mock.calls[0]?.[0]).toBe(
			'Unassigned 0 user(s), 1 failed.',
		);
		expect(mocks.toastError.mock.calls[0]?.[1]).toBeUndefined();

		// Bookkeeping is unconditional even with no successes.
		await waitFor(() =>
			expect(
				screen
					.getByRole('checkbox', { name: `Select ${USER_A}` })
					.getAttribute('aria-checked'),
			).toBe('false'),
		);
		await waitFor(() =>
			expect(
				screen.queryByRole('button', { name: 'Clear selection' }),
			).toBeNull(),
		);
		await waitFor(() => {
			expect(mocks.invalidateStaffProfiles).toHaveBeenCalledOnce();
			expect(
				harness.queryClient.getQueryState(usersListKey)?.isInvalidated ?? false,
			).toBe(true);
		});
	});

	// #1407-class post-success contract: a successful bulk unassign must clear
	// the selection AND invalidate the profile query family. Both behaviors are
	// asserted against live state — the checkbox DOM for the selection, and the
	// real QueryClient's invalidated flag for the list — so removing either
	// bookkeeping step turns this test red.
	test('a successful unassign clears the selection and invalidates the profile users list', async () => {
		const harness = await renderAtPage();

		// Seed a REAL cache entry under the production users-list key shape
		// (scope prefix via the shared `scopedKey` helper; inner segments mirror
		// staff-profile-users.ts's `queryKeyFn`). Without a live entry the
		// `isInvalidated` read would be vacuously undefined.
		const usersListKey = [
			...scopedKey('staff', ['staff-profiles', 'users']),
			{
				profileId: 'profile-1',
				q: '',
				sortId: 'created_at',
				sortOrder: 'desc',
				pageIndex: 0,
				size: 100,
			},
		];
		harness.queryClient.setQueryData(usersListKey, { users: [], count: 0 });
		expect(
			harness.queryClient.getQueryState(usersListKey)?.isInvalidated ?? false,
		).toBe(false);

		fireEvent.click(screen.getByRole('checkbox', { name: `Select ${USER_A}` }));
		await waitFor(() =>
			expect(
				screen
					.getByRole('checkbox', { name: `Select ${USER_A}` })
					.getAttribute('aria-checked'),
			).toBe('true'),
		);

		await chooseBulkAction('Unassign selected', 'More actions');
		fireEvent.click(await screen.findByRole('button', { name: 'Unassign' }));

		await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledOnce());

		// Selection cleared: no row stays checked and the selection bar unmounts.
		// Bar exit animates ~220ms before unmounting, so the gone-assertion needs
		// its own waitFor (same as the staff-users routing precedent).
		await waitFor(() =>
			expect(
				screen
					.getByRole('checkbox', { name: `Select ${USER_A}` })
					.getAttribute('aria-checked'),
			).toBe('false'),
		);
		await waitFor(() =>
			expect(
				screen.queryByRole('button', { name: 'Clear selection' }),
			).toBeNull(),
		);

		// The profile users list went through the REAL invalidation helper.
		await waitFor(() => {
			expect(mocks.invalidateStaffProfiles).toHaveBeenCalledOnce();
			expect(
				harness.queryClient.getQueryState(usersListKey)?.isInvalidated ?? false,
			).toBe(true);
		});
	});

	// Round-2 pin (PR #1413 review MAJOR): PARTIAL success (succeeded ≥ 1 AND
	// failed ≥ 1) must run the SAME post-success bookkeeping as full success —
	// selection cleared AND the real cache entry invalidated — and must surface
	// each skipped row's cause in plain words beside the counts. This kills the
	// survivor mutant that moved `clearSelection` + `invalidateStaffProfiles`
	// into the full-success-only `else` branch: that mutant leaves the checked
	// boxes checked and the cache entry fresh on this path, so this test goes
	// red on live DOM + cache state while the older `failedCount: 0` tests stay
	// green.
	test('a partial-success unassign clears the selection, invalidates the list, and names the failed users', async () => {
		mocks.bulkUnassign.mockResolvedValue({
			succeededCount: 1,
			failedCount: 1,
			failedItems: [{ userId: USER_B, reason: 'not_assigned' }],
		});

		const harness = await renderAtPage();

		const usersListKey = usersListCacheKey();
		harness.queryClient.setQueryData(usersListKey, { users: [], count: 0 });
		expect(
			harness.queryClient.getQueryState(usersListKey)?.isInvalidated ?? false,
		).toBe(false);

		fireEvent.click(screen.getByRole('checkbox', { name: `Select ${USER_A}` }));
		fireEvent.click(screen.getByRole('checkbox', { name: `Select ${USER_B}` }));
		await waitFor(() =>
			expect(
				screen
					.getByRole('checkbox', { name: `Select ${USER_A}` })
					.getAttribute('aria-checked'),
			).toBe('true'),
		);
		await waitFor(() =>
			expect(
				screen
					.getByRole('checkbox', { name: `Select ${USER_B}` })
					.getAttribute('aria-checked'),
			).toBe('true'),
		);

		await chooseBulkAction('Unassign selected', 'More actions');
		fireEvent.click(await screen.findByRole('button', { name: 'Unassign' }));

		// Partial success takes the error-toast path, never plain success, and
		// carries the per-row cause in plain words in the toast description.
		await waitFor(() => expect(mocks.toastError).toHaveBeenCalledOnce());
		expect(mocks.toastSuccess).not.toHaveBeenCalled();
		expect(mocks.toastError).toHaveBeenCalledWith(
			'Unassigned 1 user(s), 1 failed.',
			{ description: 'Blake Row: this user is not assigned to this profile.' },
		);
		// #1605: partial-success with per-row failure lines carries the
		// cause description, NOT the filter-leave warning.
		expect(mocks.toastError.mock.calls[0][1]?.description).not.toContain(
			'bulk-action-rows-may-leave-filter',
		);

		// (a) Selection cleared even though SOME rows succeeded: no row stays
		// checked and the selection bar unmounts.
		await waitFor(() =>
			expect(
				screen
					.getByRole('checkbox', { name: `Select ${USER_A}` })
					.getAttribute('aria-checked'),
			).toBe('false'),
		);
		await waitFor(() =>
			expect(
				screen
					.getByRole('checkbox', { name: `Select ${USER_B}` })
					.getAttribute('aria-checked'),
			).toBe('false'),
		);
		await waitFor(() =>
			expect(
				screen.queryByRole('button', { name: 'Clear selection' }),
			).toBeNull(),
		);

		// (b) ...and the profile users list went through the REAL invalidation
		// helper over the harness's QueryClient.
		await waitFor(() => {
			expect(mocks.invalidateStaffProfiles).toHaveBeenCalledOnce();
			expect(
				harness.queryClient.getQueryState(usersListKey)?.isInvalidated ?? false,
			).toBe(true);
		});
	});

	// ── #1442: the 401/logout path and the plain-words rejection path ────

	/**
	 * The exact failure shape a REAL Kiota client call rejects with when the
	 * API answers 401 (verified against
	 * `@microsoft/kiota-abstractions` 1.0.0-preview.103 `DefaultApiError`:
	 * `message`, `responseStatusCode`, `responseHeaders`). Driven through the
	 * REAL `shouldLogoutForFailure` → `toApiFailure` chain, which reads
	 * `responseStatusCode` off exactly this shape.
	 */
	const realClientUnauthorizedError = (): Error =>
		Object.assign(new Error('Unauthorized'), {
			responseStatusCode: 401,
			responseHeaders: {},
		});

	// THE issue complaint (#1442): `shouldLogoutForFailure` was hard-mocked to
	// false, so nobody proved that an expired-session 401 surfacing through
	// this component's bulk mutation actually reaches the central logout
	// redirect. The helper is now the REAL one; only LogoutRedirect itself is
	// mocked at the seam. A 403 must NOT log out — only 401 does.
	test('a 401 bulk-unassign rejection drives the REAL failure helper into the logout redirect with no success toast', async () => {
		mocks.bulkUnassign.mockRejectedValue(realClientUnauthorizedError());

		await renderAtPage();

		fireEvent.click(screen.getByRole('checkbox', { name: `Select ${USER_A}` }));
		await chooseBulkAction('Unassign selected', 'More actions');
		fireEvent.click(await screen.findByRole('button', { name: 'Unassign' }));

		await waitFor(() =>
			expect(screen.getByTestId('logout-redirect')).toBeTruthy(),
		);
		expect(mocks.toastSuccess).not.toHaveBeenCalled();
		expect(mocks.toastError).not.toHaveBeenCalled();

		// A 403 on the same surface keeps the page up — logout is 401-only.
		mocks.bulkUnassign.mockRejectedValue(
			Object.assign(new Error('Forbidden'), {
				responseStatusCode: 403,
				responseHeaders: {},
			}),
		);
		cleanup();
		await renderAtPage();

		fireEvent.click(screen.getByRole('checkbox', { name: `Select ${USER_A}` }));
		await chooseBulkAction('Unassign selected', 'More actions');
		fireEvent.click(await screen.findByRole('button', { name: 'Unassign' }));

		await waitFor(() =>
			expect(mocks.toastError).toHaveBeenCalledWith(
				'staff-profile-user-bulk-unassign-failure',
			),
		);
		// Single-arg error toast: the message IS the component's i18n key
		// 'staff-profile-user-bulk-unassign-failure', carried through the REAL
		// mutation-toast adapter against the mocked t().
		await waitFor(() =>
			expect(screen.queryByTestId('logout-redirect')).toBeNull(),
		);
	});

	// Transparent-failure causes (owner product rule): a NON-401 rejection
	// shows the cause in plain words, not a bare fallback line. The component
	// renders the toast through `displayLocalMutationFailure`, whose fallback
	// comes from the 'staff-profile-user-bulk-unassign-failure' i18n key; the
	// REAL adapter prefers the problem payload's own title/detail over that
	// fallback, so the raised cause is the API's plain-words sentence.
	test('a non-401 rejection surfaces the problem title in plain words via the failure i18n key', async () => {
		mocks.bulkUnassign.mockRejectedValue(
			Object.assign(new Error('Internal Server Error'), {
				responseStatusCode: 500,
				responseHeaders: {},
				body: {
					title: 'The storage service is temporarily unavailable',
					status: 500,
				},
			}),
		);

		await renderAtPage();

		fireEvent.click(screen.getByRole('checkbox', { name: `Select ${USER_A}` }));
		await chooseBulkAction('Unassign selected', 'More actions');
		fireEvent.click(await screen.findByRole('button', { name: 'Unassign' }));

		// The REAL mutation-toast adapter resolves the toast message: the
		// problem's own title (plain words) wins over the i18n fallback.
		await waitFor(() =>
			expect(mocks.toastError).toHaveBeenCalledWith(
				'The storage service is temporarily unavailable',
			),
		);
		expect(mocks.toastSuccess).not.toHaveBeenCalled();
		expect(mocks.toastWarning).not.toHaveBeenCalled();
		expect(screen.queryByTestId('logout-redirect')).toBeNull();
	});

	// Empty-warning case: choosing Unassign with nothing selected warns the
	// user in plain words instead of opening the confirm dialog.
	test('choosing the unassign action with an empty selection warns instead of confirming', async () => {
		const harness = await renderAtPage();

		// The selection bar (and its bulk menu) only mounts once a row is
		// selected; select then clear to reach the bar with an EMPTY selection.
		fireEvent.click(screen.getByRole('checkbox', { name: `Select ${USER_A}` }));
		fireEvent.click(
			await screen.findByRole('button', { name: 'Clear selection' }),
		);
		await waitFor(() =>
			expect(harness.history.location.pathname).toBe(PAGE_ROUTE_PATH),
		);

		await chooseBulkAction('Unassign selected', 'More actions');

		await waitFor(() =>
			expect(mocks.toastWarning).toHaveBeenCalledWith(
				'Select at least one user to unassign.',
			),
		);
		expect(screen.queryByRole('button', { name: 'Unassign' })).toBeNull();
		expect(mocks.bulkUnassign).not.toHaveBeenCalled();
	});
});
