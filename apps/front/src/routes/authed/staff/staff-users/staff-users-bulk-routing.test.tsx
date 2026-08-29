/** @vitest-environment jsdom */
/**
 * #820: the staff-users list offers only Export in row-selection mode; the
 * bulk management actions the API already supports
 * (`POST /staff/users/bulk-suspend|bulk-reactivate|bulk-delete`) were never
 * wired into the selection toolbar.
 *
 * Why real-router (repo precedent `$userId-edit.blocker.test.tsx`): the issue's
 * complaint is about what the ROUTE actually renders in selection mode. The
 * production failure mode lives in the seam between the page component, the
 * shared `FloatingSelectionBar`, and the toolbar children — a mocked page
 * cannot see it.
 *
 * What is real here:
 *  - the REAL `staff-users` route object (same module identity, mounted via
 *    `.update()` the way `routeTree.gen` wires it), its real `component`;
 *  - a real `createRouter` + `createMemoryHistory`, so the route resolves and
 *    renders exactly as in production;
 *  - real user interactions driving one bulk action through the real route
 *    component into the confirm dialog.
 *
 * What is faked: only the network-facing surface — the `~/lib/query/staff-users`
 * hooks, mutation toasts, and i18n strings. Nothing about the toolbar or the
 * bulk-action flow is re-implemented here.
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
import type { TestLabelMap } from '~/lib/testing/test-label-map';

const USER_A = '11111111-1111-1111-1111-111111111111';
const LIST_ROUTE_PATH = '/staff/staff-users';

const mocks = vi.hoisted(() => ({
	useStaffUsersQuery: vi.fn(),
	toStaffUserRows: vi.fn(),
	useBulkSuspendMutation: vi.fn(),
	useBulkReactivateMutation: vi.fn(),
	useBulkDeleteMutation: vi.fn(),
	bulkSuspend: vi.fn(),
	bulkReactivate: vi.fn(),
	bulkDelete: vi.fn(),
	toastSuccess: vi.fn(),
	toastError: vi.fn(),
	displayLocalMutationFailure: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('~/lib/mutation-toast', () => ({
	displayLocalMutationFailure: mocks.displayLocalMutationFailure,
	toastLocalMutationResult: {
		success: mocks.toastSuccess,
		warning: vi.fn(),
		error: mocks.toastError,
	},
}));

vi.mock('~/lib/query/staff-users', () => ({
	STAFF_USERS_QUERY_KEY: ['staff-users'],
	invalidateStaffUsers: () => Promise.resolve(),
	toStaffUserRows: mocks.toStaffUserRows,
	useStaffUsersQuery: mocks.useStaffUsersQuery,
	useBulkSuspendStaffUsersMutation: mocks.useBulkSuspendMutation,
	useBulkReactivateStaffUsersMutation: mocks.useBulkReactivateMutation,
	useBulkDeleteStaffUsersMutation: mocks.useBulkDeleteMutation,
}));

vi.mock('@org/shared-ts/lib/should-logout-for-failure', () => ({
	shouldLogoutForFailure: () => false,
}));

// The export action pulls XLSX machinery irrelevant to this suite; stubbed so
// the harness stays free of the export surface.
vi.mock('~/routes/authed/staff/staff-list-export-selected', () => ({
	StaffListExportSelectedAction: () => null,
	StaffListExportSelectedButton: () => null,
}));

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string, options?: Record<string, unknown>) => {
			const bare = key.includes(':')
				? (key.split(':').slice(1).join(':') ?? key)
				: key;
			const labels: TestLabelMap = {
				'staff-users-page-title': 'Staff users',
				'staff-users-page-description': 'Manage staff users',
				'invite-users': 'Invite users',
				'search-staff-users': 'Search staff users',
				name: 'Name',
				email: 'Email',
				level: 'Level',
				status: 'Status',
				admin: 'Admin',
				user: 'User',
				'status-active': 'Active',
				'status-suspended': 'Suspended',
				'status-unknown': 'Unknown',
				unknown: 'Unknown',
				actions: 'Actions',
				'view-profile': 'View profile',
				'no-email-address': 'No email address',
				'select-row-named': 'Select {{name}}',
				search: 'Search',
				'clear-selection': 'Clear selection',
				'more-actions': 'More actions',
				'bulk-actions': 'Bulk actions',
				'bulk-reactivate': 'Reactivate selected',
				'bulk-suspend': 'Suspend selected',
				'bulk-delete': 'Delete selected',
				suspend: 'Suspend',
				reactivate: 'Reactivate',
				delete: 'Delete',
				confirm: 'Confirm',
				cancel: 'Cancel',
				'bulk-suspend-staff-users-confirm':
					'Are you sure you want to suspend {{count}} staff member(s)?',
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

import { Route as StaffUsersListRoute } from '../staff-users';

const settledQuery = (data: unknown) => ({
	data,
	error: null,
	isPending: false,
	isError: false,
	isFetching: false,
	isSuccess: true,
	refetch: () => Promise.resolve(),
});

const staffUserPayload = () => ({
	data: [
		{
			id: USER_A,
			email: 'alex@example.com',
			firstName: 'Alex',
			lastName: 'User',
			avatarUrl: null,
			level: 'Admin',
			status: 'Active',
		},
		{
			id: '22222222-2222-2222-2222-222222222222',
			email: 'blake@example.com',
			firstName: 'Blake',
			lastName: 'Row',
			avatarUrl: null,
			level: 'User',
			status: 'Active',
		},
	],
	nextCursor: null,
});

/**
 * `createFileRoute(...)(options)` does not attach id/path/parent — the
 * generated `routeTree.gen.ts` does, with exactly this `.update()` call.
 * Same harness precedent as `$userId-edit.blocker.test.tsx`.
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
	const listRoute = mountRealRoute(StaffUsersListRoute, {
		id: LIST_ROUTE_PATH,
		path: LIST_ROUTE_PATH,
		getParentRoute: () => layoutRoute,
	});

	const addChildrenOf = (route: unknown) => {
		return widenOptions<{ addChildren: (children: unknown[]) => void }>(route)
			.addChildren;
	}
	const routeTree = addChildrenOf(rootRoute)([
		addChildrenOf(layoutRoute)([listRoute]),
	]);

	const history = createMemoryHistory({
		initialEntries: [LIST_ROUTE_PATH],
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

const renderAtList = async () => {
	const harness = buildHarness();
	openHistories.push(harness.history);

	render(
		<QueryClientProvider client={harness.queryClient}>
			<RouterProvider router={harness.router} />
		</QueryClientProvider>,
	);
	await waitFor(() =>
		expect(screen.getByTestId('staff-users-table')).toBeTruthy(),
	);
	await waitFor(() => expect(screen.getByText('Alex User')).toBeTruthy());

	return harness;
};

describe('#820 staff-users selection-mode bulk actions (real router)', () => {
	beforeEach(() => {
		vi.clearAllMocks();

		mocks.toStaffUserRows.mockImplementation(
			(
				items:
					| Array<{
							id: string;
							email: string;
							firstName: string | null;
							lastName: string | null;
							level: string | null;
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
					level: item.level,
					status: item.status,
					displayName: `${item.firstName ?? ''} ${item.lastName ?? ''}`.trim(),
				})),
		);
		mocks.useStaffUsersQuery.mockImplementation(() =>
			settledQuery(staffUserPayload()),
		);
		mocks.useBulkSuspendMutation.mockReturnValue({
			mutateAsync: mocks.bulkSuspend,
			isPending: false,
		});
		mocks.useBulkReactivateMutation.mockReturnValue({
			mutateAsync: mocks.bulkReactivate,
			isPending: false,
		});
		mocks.useBulkDeleteMutation.mockReturnValue({
			mutateAsync: mocks.bulkDelete,
			isPending: false,
		});
		mocks.bulkSuspend.mockResolvedValue({ succeededCount: 1, failedCount: 0 });
	});

	afterEach(() => {
		cleanup();
		destroyOpenHistories();
		vi.clearAllMocks();
	});

	// THE issue complaint: selection mode exposes only Export. The selection
	// toolbar must expose the bulk management actions too.
	test('selection mode exposes the bulk management actions, not only export', async () => {
		await renderAtList();

		fireEvent.click(screen.getByRole('checkbox', { name: `Select ${USER_A}` }));

		const trigger = await screen.findByRole('button', {
			name: 'Bulk actions',
			expanded: false,
		});
		fireEvent.click(trigger);
		await waitFor(() =>
			expect(trigger.getAttribute('aria-expanded')).toBe('true'),
		);

		expect(
			screen.getByRole('menuitem', { name: 'Suspend selected' }),
		).toBeTruthy();
		expect(
			screen.getByRole('menuitem', { name: 'Reactivate selected' }),
		).toBeTruthy();
		expect(
			screen.getByRole('menuitem', { name: 'Delete selected' }),
		).toBeTruthy();
	});

	// #1400 (WCAG 2.5.3 label-in-name): the trigger's accessible name must
	// EQUAL its visible label — both come from the same i18n key, so the
	// screen-reader announcement can drift away from what sighted users see.
	test('the bulk trigger accessible name equals its visible Bulk actions label', async () => {
		await renderAtList();

		fireEvent.click(screen.getByRole('checkbox', { name: `Select ${USER_A}` }));

		const trigger = await screen.findByRole('button', { name: 'Bulk actions' });
		expect(trigger.getAttribute('aria-label')).toBe('Bulk actions');
		expect(screen.queryByRole('button', { name: 'More actions' })).toBeNull();
	});

	test('a confirmed suspend drives the real route component into the bulk mutation', async () => {
		await renderAtList();

		fireEvent.click(screen.getByRole('checkbox', { name: `Select ${USER_A}` }));

		await chooseBulkAction('Suspend selected', 'Bulk actions');

		// Destructive actions require confirmation before firing.
		expect(
			await screen.findByText(
				'Are you sure you want to suspend 1 staff member(s)?',
			),
		).toBeTruthy();
		fireEvent.click(screen.getByRole('button', { name: 'Suspend' }));

		await waitFor(() => expect(mocks.bulkSuspend).toHaveBeenCalledOnce());
		expect(mocks.bulkSuspend).toHaveBeenCalledWith({
			userIds: [USER_A],
		});
		await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledOnce());
	});

	test('typing a search draft outside selection mode behaves as before', async () => {
		await renderAtList();

		const searchBox = screen.getByRole('searchbox', { name: 'Search' });
		fireEvent.change(searchBox, { target: { value: 'ale' } });

		expect((searchBox as HTMLInputElement).value).toBe('ale');
	});

	// Characterization guard (#820 review follow-up): entering selection mode
	// has always discarded an uncommitted table-search draft (the search box is
	// locked while rows are selected, so a live draft would sit hidden until
	// exit). The reset moved from a render-side effect into the selection
	// change handler itself — these tests pin the observable behavior through
	// the real route so the relocation cannot silently drop it.
	test('entering selection mode discards an uncommitted table-search draft', async () => {
		await renderAtList();

		const searchBox = screen.getByRole('searchbox', { name: 'Search' });
		fireEvent.change(searchBox, { target: { value: 'alex' } });
		expect((searchBox as HTMLInputElement).value).toBe('alex');

		fireEvent.click(screen.getByRole('checkbox', { name: `Select ${USER_A}` }));

		expect(
			await screen.findByRole('button', { name: 'Clear selection' }),
		).toBeTruthy();
		expect(
			(
				screen.getByRole('searchbox', {
					name: 'Search',
				}) as HTMLInputElement
			).value,
		).toBe('');
	});

	test('after leaving selection mode the search draft starts empty again', async () => {
		await renderAtList();

		fireEvent.change(screen.getByRole('searchbox', { name: 'Search' }), {
			target: { value: 'alex' },
		});
		fireEvent.click(screen.getByRole('checkbox', { name: `Select ${USER_A}` }));
		fireEvent.click(
			await screen.findByRole('button', { name: 'Clear selection' }),
		);

		await waitFor(() =>
			expect(
				screen.queryByRole('button', { name: 'Clear selection' }),
			).toBeNull(),
		);

		const searchBox = screen.getByRole('searchbox', { name: 'Search' });
		fireEvent.change(searchBox, { target: { value: 'blake' } });
		expect((searchBox as HTMLInputElement).value).toBe('blake');
	});
});
