/** @vitest-environment jsdom */
/**
 * #1386: the staff PROFILES list offers only Export in row-selection mode,
 * even though the API already ships `POST /staff/profiles/bulk-delete`
 * (permission-gated, exposed by the kiota client).
 *
 * Why real-router (repo precedent `staff-users-bulk-routing.test.tsx` from
 * #1385, which this lane mirrors): the issue's complaint is about what the
 * ROUTE actually renders in selection mode. The production failure mode lives
 * in the seam between the page component, the shared `FloatingSelectionBar`,
 * and the toolbar children — a mocked page cannot see it.
 *
 * What is real here:
 *  - the REAL `profiles` route object (same module identity, mounted via
 *    `.update()` the way `routeTree.gen` wires it), its real `component`;
 *  - a real `createRouter` + `createMemoryHistory`, so the route resolves and
 *    renders exactly as in production;
 *  - the real `useRowSelection` hook driving the page's selection state.
 *
 * What is faked: only the network-facing surface — the `~/lib/query/staff-profiles`
 * hooks, mutation toasts, and i18n strings. The row-selection hook stays REAL
 * and unmocked (#1408 r1 mutations A/H — a selection id absent from `rows`
 * reaching the wire — are pinned in `_profiles-bulk-actions.test.tsx`, the
 * exact seam where such an id arrives; faking one here would only exercise a
 * module-mock, since `pruneSelection` is called lexically inside the hook).
 * Nothing about the toolbar or the bulk-action flow is re-implemented.
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

const PROFILE_A = 'aaaaaaaa-1111-1111-1111-111111111111';
const LIST_ROUTE_PATH = '/staff/profiles';

const mocks = vi.hoisted(() => ({
	useStaffProfilesQuery: vi.fn(),
	toStaffProfileRows: vi.fn(),
	useBulkDeleteMutation: vi.fn(),
	bulkDelete: vi.fn(),
	invalidateStaffProfiles: vi.fn(),
	toastSuccess: vi.fn(),
	toastError: vi.fn(),
	displayLocalMutationFailure: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('~/lib/mutation-toast', () => ({
	displayLocalMutationFailure: mocks.displayLocalMutationFailure,
	toastLocalMutationResult: {
		success: mocks.toastSuccess,
		error: mocks.toastError,
	},
}));

vi.mock('~/lib/query/staff-profiles', () => ({
	STAFF_PROFILES_QUERY_KEY: ['staff-profiles'],
	invalidateStaffProfiles: mocks.invalidateStaffProfiles,
	toStaffProfileRows: mocks.toStaffProfileRows,
	useStaffProfilesQuery: mocks.useStaffProfilesQuery,
	useBulkDeleteStaffProfilesMutation: mocks.useBulkDeleteMutation,
}));

// The export action pulls CSV machinery irrelevant to this suite; stubbed so
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
				profiles: 'Profiles',
				'staff-profiles-page-description': 'Manage staff profiles',
				'new-profile': 'New profile',
				'search-profiles': 'Search profiles',
				profile: 'Profile',
				description: 'Description',
				members: 'Members',
				actions: 'Actions',
				'view-profile': 'View profile',
				'select-row-named': 'Select {{name}}',
				search: 'Search',
				'clear-selection': 'Clear selection',
				'more-actions': 'More actions',
				'export-selected': 'Export selected',
				'bulk-actions': 'Bulk actions',
				'bulk-delete': 'Delete selected',
				delete: 'Delete',
				confirm: 'Confirm',
				cancel: 'Cancel',
				'bulk-delete-profiles-confirm':
					'Are you sure you want to delete {{count}} selected profile(s)? Assigned members lose this profile.',
			};

			return (labels[bare] ?? bare).replace(
				/\{\{(\w+)\}\}/g,
				(_, name: string) => {
					const value = options?.[name];
					if (typeof value === 'string' || typeof value === 'number') {
						return String(value);
					}
					return '';
				},
			);
		},
		i18n: { language: 'en' },
	}),
}));

import type { TestLabelMap } from '~/lib/testing/test-label-map';

import { Route as StaffProfilesListRoute } from '../profiles';

const settledQuery = (data: unknown) => ({
	data,
	error: null,
	isPending: false,
	isError: false,
	isFetching: false,
	isSuccess: true,
	refetch: () => Promise.resolve(),
});

const staffProfilesPayload = () => ({
	data: [
		{
			id: PROFILE_A,
			name: 'Recruiter',
			description: 'Recruiter profile',
			userAccountCount: 3,
		},
	],
	nextCursor: null,
});

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
	const listRoute = mountRealRoute(StaffProfilesListRoute, {
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
		expect(screen.getByTestId('staff-profiles-table')).toBeTruthy(),
	);
	await waitFor(() => expect(screen.getByText('Recruiter')).toBeTruthy());

	return harness;
};

/**
 * Opens this page's bulk-action menu by its accessible name ("Bulk actions" —
 * here `aria-label` equals the visible label) and clicks the delete item once
 * settled. Deliberately NOT the shared `chooseBulkAction` helper: that helper
 * hardcodes the users list's "More actions"-over-"Bulk actions" mismatch
 * (#1400 owns fixing that file); this page must not replicate it.
 */
const openBulkActionsMenu = async () => {
	const trigger = await screen.findByRole('button', {
		name: 'Bulk actions',
		expanded: false,
	});

	fireEvent.click(trigger);
	await waitFor(() =>
		expect(
			trigger.getAttribute('aria-expanded'),
			'bulk menu did not open',
		).toBe('true'),
	);
	fireEvent.click(screen.getByRole('menuitem', { name: 'Delete selected' }));
};

describe('#1386 staff profiles selection-mode bulk delete (real router)', () => {
	beforeEach(() => {
		vi.clearAllMocks();

		mocks.toStaffProfileRows.mockImplementation(
			(items: Array<{ id: string; name: string }> | null | undefined) =>
				(items ?? []).map((item) => ({
					id: item.id,
					name: item.name,
					description: null,
					userAccountCount: 3,
					icon: 'briefcase',
					iconTone: 'neutral',
				})),
		);
		mocks.useStaffProfilesQuery.mockImplementation(() =>
			settledQuery(staffProfilesPayload()),
		);
		mocks.useBulkDeleteMutation.mockReturnValue({
			mutateAsync: mocks.bulkDelete,
			isPending: false,
		});
		mocks.bulkDelete.mockResolvedValue({ succeededCount: 1, failedCount: 0 });
		mocks.invalidateStaffProfiles.mockResolvedValue(undefined);
	});

	afterEach(() => {
		cleanup();
		destroyOpenHistories();
		vi.clearAllMocks();
	});

	// THE issue complaint: selection mode exposes only Export. The selection
	// toolbar must expose Delete selected too.
	test('selection mode exposes Delete selected, not only export', async () => {
		await renderAtList();

		fireEvent.click(
			screen.getByRole('checkbox', { name: `Select ${PROFILE_A}` }),
		);

		await openBulkActionsMenu();

		// Reaching the confirm dialog proves the menu item rendered
		// unconditionally and was clickable.
		expect(await screen.findByText(/delete 1 selected profile/)).toBeTruthy();
	});

	test('a confirmed delete drives the real route component into the bulk mutation', async () => {
		await renderAtList();

		fireEvent.click(
			screen.getByRole('checkbox', { name: `Select ${PROFILE_A}` }),
		);

		await openBulkActionsMenu();

		// Destructive actions require confirmation before firing; the dialog
		// names the count and the consequence.
		expect(
			await screen.findByText(
				'Are you sure you want to delete 1 selected profile(s)? Assigned members lose this profile.',
			),
		).toBeTruthy();
		fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

		await waitFor(() => expect(mocks.bulkDelete).toHaveBeenCalledOnce());
		expect(mocks.bulkDelete).toHaveBeenCalledWith({
			profileIds: [PROFILE_A],
		});
		await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledOnce());
	});

	test('typing a search draft outside selection mode behaves as before', async () => {
		await renderAtList();

		const searchBox = screen.getByRole('searchbox', { name: 'Search' });
		fireEvent.change(searchBox, { target: { value: 'rec' } });

		expect((searchBox as HTMLInputElement).value).toBe('rec');
	});

	// Characterization guard (#820 review follow-up, mirrored here): entering
	// selection mode has always discarded an uncommitted table-search draft
	// (the search box is locked while rows are selected, so a live draft would
	// sit hidden until exit). The reset lives in the selection-change handler
	// rather than a render-side effect — these tests pin the observable
	// behavior through the real route so the relocation cannot silently drop
	// it.
	test('entering selection mode discards an uncommitted table-search draft', async () => {
		await renderAtList();

		const searchBox = screen.getByRole('searchbox', { name: 'Search' });
		fireEvent.change(searchBox, { target: { value: 'recruiter' } });
		expect((searchBox as HTMLInputElement).value).toBe('recruiter');

		fireEvent.click(
			screen.getByRole('checkbox', { name: `Select ${PROFILE_A}` }),
		);

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
});
