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
 * data hooks, mutation toasts, and i18n strings. Nothing about the toolbar, the
 * selection model, or the bulk-action flow is re-implemented here.
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
	displayLocalMutationFailure: vi.fn().mockResolvedValue(undefined),
	invalidateStaffProfiles: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('~/lib/mutation-toast', () => ({
	displayLocalMutationFailure: mocks.displayLocalMutationFailure,
	toastLocalMutationResult: {
		success: mocks.toastSuccess,
		warning: mocks.toastWarning,
		error: mocks.toastError,
	},
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

vi.mock('~/lib/should-logout-for-failure', () => ({
	shouldLogoutForFailure: () => false,
}));

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string, options?: Record<string, unknown>) => {
			const bare = key.includes(':')
				? (key.split(':').slice(1).join(':') ?? key)
				: key;
			const labels: Record<string, string> = {
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
			};

			return (labels[bare] ?? bare).replace(
				/\{\{(\w+)\}\}/g,
				(_, name: string) => String(options?.[name] ?? ''),
			);
		},
		i18n: { language: 'en' },
	}),
}));

import { chooseBulkAction } from '~/test-helpers/choose-bulk-action';

import { Route as ProfileUsersRoute } from './users';

type QueryState = {
	data?: unknown;
	error?: unknown;
	isPending: boolean;
	isError: boolean;
	isError_: boolean;
	isFetching: boolean;
	refetch: () => Promise<void>;
};

const settledQuery = (data: unknown): QueryState => ({
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
			id: '22222222-2222-2222-2222-222222222222',
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
 * `createFileRoute(...)(options)` does not attach id/path/parent — the
 * generated `routeTree.gen.ts` does, with exactly this `.update()` call.
 * Same harness precedent as `staff-users-bulk-routing.test.tsx`.
 */
function widenOptions<T>(value: unknown): T {
	return value as T;
}
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
	} as never);
	const pageRoute = mountRealRoute(ProfileUsersRoute, {
		path: '/staff/profiles/$profileId/users',
		getParentRoute: () => layoutRoute,
	});

	function addChildrenOf(route: unknown) {
		return widenOptions<{ addChildren: (children: unknown[]) => void }>(route)
			.addChildren;
	}
	const routeTree = addChildrenOf(rootRoute)([
		addChildrenOf(layoutRoute)([pageRoute]),
	]);

	const history = createMemoryHistory({
		initialEntries: [PAGE_ROUTE_PATH],
	});
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	const router = createRouter({
		routeTree,
		history,
		context: { queryClient },
	} as never);

	return { router, history, queryClient };
};

const renderAtPage = async () => {
	const harness = buildHarness();
	openHistories.push(harness.history);

	render(
		<QueryClientProvider client={harness.queryClient}>
			<RouterProvider router={harness.router as never} />
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

		await chooseBulkAction('Unassign selected');

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
	});

	test('a partial-success unassign surfaces the failure counts instead of plain success', async () => {
		mocks.bulkUnassign.mockResolvedValue({
			succeededCount: 0,
			failedCount: 1,
			failedItems: [{ userId: USER_A, reason: 'not_assigned' }],
		});

		await renderAtPage();

		fireEvent.click(screen.getByRole('checkbox', { name: `Select ${USER_A}` }));
		await chooseBulkAction('Unassign selected');
		fireEvent.click(await screen.findByRole('button', { name: 'Unassign' }));

		await waitFor(() => expect(mocks.bulkUnassign).toHaveBeenCalledOnce());
		await waitFor(() => expect(mocks.toastError).toHaveBeenCalledOnce());
		expect(mocks.toastSuccess).not.toHaveBeenCalled();
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

		await chooseBulkAction('Unassign selected');
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
});
