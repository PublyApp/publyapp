/** @vitest-environment jsdom */
/**
 * #1314-r1 MAJOR regression guard: the both-dirty save→redirect path driven
 * through a REAL TanStack router.
 *
 * Why real-router: the reviewed regression lives exactly in the seam between
 * `history.block`'s stacked closures and React render snapshots. A mocked
 * `useBlocker` cannot see it — the production failure mode IS the real
 * registration machinery. Following the repo's real-route harness precedent
 * (`section-routing.test.tsx`, `deep-link-canonicalization.test.tsx`):
 *
 * What is real here:
 *  - the REAL `$userId-edit` route object (same module identity, mounted via
 *    `.update()` the way `routeTree.gen` wires it), its real `component`,
 *    real RHF form, real `ConfirmDialog`, real `Link`;
 *  - a real `createRouter` + `createMemoryHistory`, so `useBlocker`
 *    registers into the real stacked-blockers array and every navigation
 *    runs through the genuine blocking pipeline;
 *  - real navigation triggered by the page's own Save/Cancel buttons.
 *
 * What is faked: only the network-facing surface — the `~/lib/query/*` hooks
 * and transformers, the mutation toasts, i18n strings, and the (irrelevant)
 * change-email dialog. Nothing about the blocker predicate is re-implemented
 * or re-declared here.
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
// The route is mounted under its PARAMETERIZED path (as routeTree.gen wires
// it); navigation uses the concrete resolved URL below.
const EDIT_ROUTE_PATH = '/staff/staff-users/$userId/edit';
const DETAIL_ROUTE_PATH = '/staff/staff-users/$userId';
const editUrl = (userId: string) => `/staff/staff-users/${userId}/edit`;
const detailUrl = (userId: string) => `/staff/staff-users/${userId}`;

const mocks = vi.hoisted(() => ({
	toStaffUserDetails: vi.fn(),
	toAssignedStaffProfiles: vi.fn(),
	useUpdateStaffUserMutation: vi.fn(),
	useUpdateStaffUserProfilesMutation: vi.fn(),
	updateStaffUser: vi.fn(),
	updateStaffUserProfiles: vi.fn(),
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

vi.mock('~/lib/query/staff-users', () => {
	// Memoized ONCE: real TanStack Query returns referentially stable results
	// between renders; fresh-per-render mocks would loop every effect/store
	// subscribed to them.
	let details: ReturnType<typeof settledQuery> | null = null;
	let assignedProfiles: ReturnType<typeof settledQuery> | null = null;

	return {
		STAFF_USERS_QUERY_KEY: ['staff-users'],
		STAFF_USER_DETAILS_QUERY_KEY: ['staff-users', 'detail'],
		STAFF_USER_PROFILES_QUERY_KEY: ['staff-users', 'detail', 'profiles'],
		invalidateStaffUsers: () => Promise.resolve(),
		selectStaffUserCrumbName: () => undefined,
		staffUserCrumbQuery: () => ({}),
		toStaffUserDetails: mocks.toStaffUserDetails,
		toAssignedStaffProfiles: mocks.toAssignedStaffProfiles,
		useStaffUserDetailsQuery: () =>
			(details ??= settledQuery({
				id: USER_A,
				email: 'alex@example.com',
				firstName: 'Alex',
				lastName: 'User',
				avatarUrl: '',
				accountLevel: 'Admin',
				status: 'Active',
			})),
		useStaffUserProfilesQuery: () =>
			(assignedProfiles ??= settledQuery({
				assignedProfiles: [{ id: 'profile-1' }],
			})),
		useUpdateStaffUserMutation: mocks.useUpdateStaffUserMutation,
		useUpdateStaffUserProfilesMutation:
			mocks.useUpdateStaffUserProfilesMutation,
	};
});

vi.mock('~/lib/query/staff-profiles', () => {
	let catalogue: ReturnType<typeof settledQuery> | null = null;

	return {
		useStaffProfilesQuery: () =>
			(catalogue ??= settledQuery({
				data: [
					{ id: 'profile-1', name: 'Publishing', description: null },
					{ id: 'profile-2', name: 'Billing', description: null },
				],
				nextCursor: null,
			})),
	};
});

vi.mock('@org/shared-ts/lib/should-logout-for-failure', () => ({
	shouldLogoutForFailure: () => false,
}));

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string) => {
			const bare = key.includes(':')
				? (key.split(':').slice(1).join(':') ?? key)
				: key;
			const labels: TestLabelMap = {
				'first-name': 'First name',
				'last-name': 'Last name',
				'email-address': 'Email address',
				'email-managed-separately': 'Email changes are managed separately.',
				'avatar-url': 'Avatar URL',
				role: 'Role',
				admin: 'Admin',
				user: 'User',
				status: 'Status',
				'status-active': 'Active',
				'status-suspended': 'Suspended',
				'status-managed-from-details':
					'Status is managed from the details view.',
				'search-profiles': 'Search profiles…',
				'select-profiles': 'Select profiles',
				profiles: 'Profiles',
				cancel: 'Cancel',
				'save-changes': 'Save changes',
				'unsaved-changes': 'Unsaved changes',
				'unsaved-changes-dialog-title': 'Leave without saving?',
				'leave-page': 'Leave page',
				close: 'Close',
				'back-to-user': 'Back to staff user',
				'edit-staff-user': 'Edit staff user',
				identity: 'Identity',
				access: 'Access',
			};

			return labels[bare] ?? bare;
		},
		i18n: { language: 'en' },
	}),
}));

// Irrelevant to the nav-guard behaviour under test; stubbed to keep the
// harness free of the email-mutation surface.
vi.mock('./_change-email-dialog', () => ({
	ChangeStaffUserEmailDialog: () => null,
}));

import { Route as StaffUserEditRoute } from './$userId-edit';

const settledQuery = (data: unknown) => ({
	data,
	error: null,
	isPending: false,
	isError: false,
	isFetching: false,
	isSuccess: true,
	refetch: () => Promise.resolve(),
});

/**
 * `createFileRoute(...)(options)` does not attach id/path/parent — the
 * generated `routeTree.gen.ts` does, with exactly this `.update()` call.
 * Doing the same here mounts the REAL route object under a throwaway parent.
 */
// `.addChildren`/`.update` exist at runtime on every route but are absent
// from the exported `options` union; the helper is the ONE widening point
// (a single assert through a named shape), matching the repo's other
// real-route suites.
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

/** Browser histories leak window-level listeners across tests; every
 * harness registers here and is destroyed on teardown. Memory history never
 * registers one, but uniform teardown keeps the harness honest. */
const openHistories: { destroy: () => void }[] = [];

const destroyOpenHistories = (): void => {
	while (openHistories.length > 0) {
		openHistories.pop()?.destroy();
	}
};

const buildHarness = () => {
	const rootRoute = createRootRoute({
		// The repo's route augmentation (breadcrumbs.ts) requires `crumbs` on
		// every route's staticData; these throwaway harness routes opt out
		// with the 'shell' marker, exactly like real shell surfaces.
		staticData: { crumbs: 'shell' },
		component: () => <Outlet />,
	});
	const layoutRoute = createRoute({
		getParentRoute: () => rootRoute,
		id: '/_authed-layout',
		staticData: { crumbs: 'shell' },
		component: () => <Outlet />,
	});
	const editRoute = mountRealRoute(StaffUserEditRoute, {
		id: EDIT_ROUTE_PATH,
		path: EDIT_ROUTE_PATH,
		getParentRoute: () => layoutRoute,
	});
	// The redirect destination is a stub: this suite asserts that navigation
	// LANDS there (or was blocked before reaching it), nothing about the
	// detail page itself.
	const detailStubRoute = createRoute({
		getParentRoute: () => layoutRoute,
		path: DETAIL_ROUTE_PATH,
		staticData: { crumbs: 'shell' },
		component: () => (
			<div data-testid="staff-user-detail-stub">user detail</div>
		),
	});

	const addChildrenOf = (route: unknown) => {
		return widenOptions<{ addChildren: (children: unknown[]) => void }>(route)
			.addChildren;
	};
	const routeTree = addChildrenOf(rootRoute)([
		addChildrenOf(layoutRoute)([editRoute, detailStubRoute]),
	]);

	const history = createMemoryHistory({ initialEntries: [editUrl(USER_A)] });
	// Capture every blocker registration the same way the router hands them
	// to `history.block` — purely observational, never re-implemented. Typed
	// straight off the bound method so the shim needs no assertion.
	const originalBlock = history.block.bind(history);
	const blockers: Parameters<typeof originalBlock>[0][] = [];
	history.block = (registration) => {
		blockers.push(registration);

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

const renderAtEdit = async () => {
	const harness = buildHarness();
	openHistories.push(harness.history);

	render(
		<QueryClientProvider client={harness.queryClient}>
			<RouterProvider router={harness.router} />
		</QueryClientProvider>,
	);
	await waitFor(() =>
		expect(screen.getByTestId('staff-user-edit-page')).toBeTruthy(),
	);
	await screen.findByDisplayValue('Alex');

	return harness;
};

describe('#1314-r1 staff-user edit nav guard (real router)', () => {
	beforeEach(() => {
		vi.clearAllMocks();

		mocks.toStaffUserDetails.mockImplementation(() => ({
			id: USER_A,
			email: 'alex@example.com',
			firstName: 'Alex',
			lastName: 'User',
			avatarUrl: '',
			accountLevel: 'Admin',
			status: 'Active',
		}));
		mocks.toAssignedStaffProfiles.mockImplementation(
			(
				payload:
					| { assignedProfiles?: Array<{ id: string }> }
					| undefined
					| null,
			) =>
				(payload?.assignedProfiles ?? []).map((profile) => ({
					id: profile.id,
					name: profile.id === 'profile-1' ? 'Publishing' : 'Billing',
					description: null,
				})),
		);
		mocks.useUpdateStaffUserMutation.mockReturnValue({
			mutateAsync: mocks.updateStaffUser,
			isPending: false,
		});
		mocks.useUpdateStaffUserProfilesMutation.mockReturnValue({
			mutateAsync: mocks.updateStaffUserProfiles,
			isPending: false,
		});
		mocks.updateStaffUser.mockResolvedValue({ id: USER_A });
		mocks.updateStaffUserProfiles.mockResolvedValue({
			assignedProfiles: [{ id: 'profile-1' }],
		});
	});

	afterEach(() => {
		cleanup();
		destroyOpenHistories();
		vi.clearAllMocks();
	});

	// THE reviewed MAJOR: a successful save followed by the redirect used to
	// trip "Leave without saving?" because the stacked blocker closures read
	// a render-frozen hasSaved/isDirty snapshot. The guard must decide from
	// values readable live at navigation time, so the redirect lands cleanly
	// even when identity AND profile assignments were both dirty.
	test('a successful save redirects past the guard even when identity and profiles are both dirty', async () => {
		const { history } = await renderAtEdit();

		fireEvent.change(screen.getByLabelText('First name'), {
			target: { value: 'Alex Saved' },
		});
		fireEvent.click(screen.getByRole('checkbox', { name: 'Billing' }));
		fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

		await waitFor(() =>
			expect(mocks.updateStaffUser).toHaveBeenCalledWith(
				expect.objectContaining({ userId: USER_A, firstName: 'Alex Saved' }),
			),
		);
		await waitFor(() =>
			expect(mocks.updateStaffUserProfiles).toHaveBeenCalledWith({
				userId: USER_A,
				profileIds: ['profile-1', 'profile-2'],
			}),
		);
		await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledOnce());

		// The redirect must LAND on the detail route — not stall behind the
		// confirm dialog with a stale snapshot answering the stacked closures.
		await waitFor(() =>
			expect(screen.getByTestId('staff-user-detail-stub')).toBeTruthy(),
		);
		expect(history.location.pathname).toBe(detailUrl(USER_A));
		expect(screen.queryByText('Leave without saving?')).toBeNull();
	});

	// Companion guard against overcorrection: the blocker must still stop a
	// genuinely dirty navigation that did not just go through a save.
	test('a genuinely dirty cancel navigation is still blocked with the confirm dialog', async () => {
		const { history } = await renderAtEdit();

		fireEvent.change(screen.getByLabelText('First name'), {
			target: { value: 'Dirty Name' },
		});
		fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

		expect(await screen.findByText('Leave without saving?')).toBeTruthy();
		expect(history.location.pathname).toBe(editUrl(USER_A));
		expect(screen.getByTestId('staff-user-edit-page')).toBeTruthy();
	});
});
