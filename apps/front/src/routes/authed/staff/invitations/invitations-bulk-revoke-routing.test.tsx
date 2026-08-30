/** @vitest-environment jsdom */
/**
 * #1387 real-router suite for the staff invitations selection toolbar — the
 * page currently offers only Export in row-selection mode even though the API
 * already ships `POST /staff/invitations/bulk-revoke` (kiota client exposes
 * `client.staff.invitations.bulkRevoke`).
 *
 * Why real-router (repo precedent: the #820 `staff-users-bulk-routing` suite):
 * the issue's complaint is about what the ROUTE actually renders in selection
 * mode. The production failure mode lives in the seam between the page
 * component, the shared `FloatingSelectionBar`, and the toolbar children — a
 * mocked page cannot see it.
 *
 * What is real here:
 *  - the REAL invitations route object (same module identity, mounted via
 *    `.update()` the way `routeTree.gen` wires it), its real `component`;
 *  - a real `createRouter` + `createMemoryHistory`, so the route resolves and
 *    renders exactly as in production;
 *  - real user interactions driving Revoke selected through the real route
 *    component into the confirm dialog.
 *
 * What is faked: only the network-facing surface — the `~/lib/query/staff-invitations`
 * hooks, mutation toasts, and i18n strings. Nothing about the toolbar or the
 * bulk-revoke flow is re-implemented here.
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

const PENDING_A = '11111111-1111-1111-1111-111111111111';
const ACCEPTED_B = '22222222-2222-2222-2222-222222222222';
const LIST_ROUTE_PATH = '/staff/invitations';
/** scopedKey('staff', STAFF_INVITATIONS_QUERY_KEY) — see create-hooks.ts. */
const STAFF_INVITATIONS_SCOPED_KEY = ['staff', 'staff-invitations'];

const mocks = vi.hoisted(() => ({
	useStaffInvitationsQuery: vi.fn(),
	toInvitationRows: vi.fn(),
	useBulkRevokeMutation: vi.fn(),
	bulkRevoke: vi.fn(),
	invalidateStaffInvitations: vi.fn(),
	toastSuccess: vi.fn(),
	toastWarning: vi.fn(),
	toastError: vi.fn(),
	displayLocalMutationFailure: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('~/lib/mutation-toast', () => ({
	displayLocalMutationFailure: mocks.displayLocalMutationFailure,
	toastLocalMutationResult: {
		success: mocks.toastSuccess,
		warning: mocks.toastWarning,
		error: mocks.toastError,
	},
}));

vi.mock('~/lib/query/staff-invitations', () => ({
	STAFF_INVITATIONS_QUERY_KEY: ['staff-invitations'],
	// Mocked per-test (not stubbed): the post-success invalidation contract is
	// pinned through this spy AND through real QueryClient state below.
	invalidateStaffInvitations: mocks.invalidateStaffInvitations,
	useStaffInvitationsQuery: mocks.useStaffInvitationsQuery,
	useResendStaffInvitationMutation: () => ({
		mutateAsync: vi.fn(),
		isPending: false,
	}),
	useRevokeStaffInvitationMutation: () => ({
		mutateAsync: vi.fn(),
		isPending: false,
	}),
	useBulkRevokeStaffInvitationsMutation: mocks.useBulkRevokeMutation,
}));

// The table-columns module owns the per-row actions (resend/revoke single);
// its machinery is irrelevant to the selection-toolbar flow under test, but
// the real page still imports it through createInvitationColumns.
vi.mock('@org/shared-ts/lib/should-logout-for-failure', () => ({
	shouldLogoutForFailure: () => false,
}));

// The export action pulls XLSX/CSV download machinery irrelevant to this
// suite; stubbed so the harness stays free of the export surface.
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
				'staff-invitations': 'Staff invitations',
				'invite-staff-users-to-the-platform':
					'Invite staff users to the platform.',
				'invite-user': 'Invite user',
				invitee: 'Invitee',
				profiles: 'Profiles',
				'invited-by': 'Invited by',
				expires: 'Expires',
				status: 'Status',
				actions: 'Actions',
				'all-statuses': 'All statuses',
				'invitation-status-pending': 'Pending',
				'invitation-status-accepted': 'Accepted',
				'invitation-status-expired': 'Expired',
				'invitation-status-revoked': 'Revoked',
				unknown: 'Unknown',
				'no-invitations-found': 'No invitations found.',
				'no-invitations-match-your-search': 'No invitations match your search.',
				'select-row-named': 'Select {{name}}',
				'selected-count': '{{count}} selected',
				'clear-selection': 'Clear selection',
				'more-actions': 'More actions',
				'bulk-actions': 'Bulk actions',
				'revoke-selected': 'Revoke selected',
				revoke: 'Revoke',
				cancel: 'Cancel',
				'confirm-bulk-revoke-invitations':
					'Are you sure you want to revoke {{count}} selected invitation(s)?',
				'only-pending-invitations-can-be-revoked':
					'Only pending invitations can be revoked.',
				'invitation-bulk-revoke-success':
					'Successfully revoked {{count}} invitation(s).',
				'invitation-bulk-revoke-partial-success':
					'Revoked {{succeeded}} invitation(s), {{failed}} failed.',
				'invitation-bulk-revoke-reason-not-found': '{{count}} not found',
				'invitation-bulk-revoke-reason-already-accepted':
					'{{count}} already accepted',
				'invitation-bulk-revoke-reason-other': '{{count}} could not be revoked',
				'invitation-bulk-revoke-failure':
					'Failed to revoke selected invitations.',
				'bulk-action-rows-may-leave-filter':
					'Some rows may no longer appear in the filtered view.',
				'bulk-action-total-failure-no-reason':
					"The server didn't specify a reason for this failure. Try again, or contact support if the problem persists.",
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

import { Route as InvitationsListRoute } from './index';
const settledQuery = (data: unknown) => ({
	data,
	error: null,
	isPending: false,
	isError: false,
	isFetching: false,
	isSuccess: true,
	refetch: () => Promise.resolve(),
});

const invitationPayload = () => ({
	data: [
		{
			id: PENDING_A,
			email: 'pending@example.com',
			profileName: 'Writer',
			invitedByName: 'Alex Admin',
			status: 'Pending',
			acceptedAt: null,
			createdAt: '2026-08-01T10:00:00Z',
			expiresAt: null,
		},
		{
			id: ACCEPTED_B,
			email: 'accepted@example.com',
			profileName: 'Reader',
			invitedByName: 'Alex Admin',
			status: 'Accepted',
			acceptedAt: '2026-08-02T10:00:00Z',
			createdAt: '2026-08-01T10:00:00Z',
			expiresAt: null,
		},
	],
	nextCursor: null,
});

/**
 * `createFileRoute(...)(options)` does not attach id/path/parent — the
 * generated `routeTree.gen.ts` does, with exactly this `.update()` call.
 * Same harness precedent as the #820 routing suite.
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
	const listRoute = mountRealRoute(InvitationsListRoute, {
		id: LIST_ROUTE_PATH,
		path: LIST_ROUTE_PATH,
		getParentRoute: () => layoutRoute,
	});

	const addChildrenOf = (route: unknown) => {
		return widenOptions<{ addChildren: (children: unknown[]) => void }>(route)
			.addChildren;
	};
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
		expect(screen.getByTestId('staff-invitations-table')).toBeTruthy(),
	);
	await waitFor(() =>
		expect(screen.getByText('pending@example.com')).toBeTruthy(),
	);

	return harness;
};

/**
 * ONE parameterised post-mutation contract over EVERY 200-response shape
 * (#1387 r3 MAJOR): full success, partial success, AND all-failure. Whatever
 * the succeeded/failed mix, the bookkeeping is unconditional — selection
 * cleared (row checkboxes unchecked, FloatingSelectionBar unmounted after its
 * exit animation) and the scoped cache entry flipped to isInvalidated on the
 * REAL QueryClient — while the toast renders the outcome (success count vs
 * failure counts plus the grouped per-item reasons). Any FOURTH response
 * shape must be added to this table and inherits every assertion; leaving the
 * all-failure shape out of the pinned paths is exactly what let the round-3
 * "skip invalidation unless succeededCount > 0" mutant survive 10/10.
 */
type BulkStaffInvitationActionResult = {
	succeededCount: number;
	failedCount: number;
	failedItems?: { invitationId: string; reason: string }[];
};

type BulkRevokeOutcomeCase =
	| {
			name: string;
			outcome: 'success';
			response: BulkStaffInvitationActionResult;
			successToastArgs: unknown[];
	  }
	| {
			name: string;
			outcome: 'error';
			response: BulkStaffInvitationActionResult;
			errorToastArgs: unknown[];
	  };

const BULK_REVOKE_OUTCOME_CASES: BulkRevokeOutcomeCase[] = [
	{
		name: 'a full-success',
		outcome: 'success',
		response: { succeededCount: 2, failedCount: 0 },
		successToastArgs: [
			'Successfully revoked 2 invitation(s).',
			'Some rows may no longer appear in the filtered view.',
		],
	},
	{
		name: 'a partial-success',
		outcome: 'error',
		response: {
			succeededCount: 1,
			failedCount: 1,
			failedItems: [{ invitationId: ACCEPTED_B, reason: 'not_found' }],
		},
		errorToastArgs: ['Revoked 1 invitation(s), 1 failed.', '1 not found'],
	},
	{
		name: 'an all-failure',
		outcome: 'error',
		response: {
			succeededCount: 0,
			failedCount: 1,
			failedItems: [{ invitationId: PENDING_A, reason: 'already_accepted' }],
		},
		errorToastArgs: [
			'Revoked 0 invitation(s), 1 failed.',
			'1 already accepted',
		],
	},
	// #1862: a null reason must fall back to the generic "other" key — never a
	// known reason, never empty. The `?? ''` fallback turns null/undefined into
	// '', which Map.get misses, so the "other" key fires. The `|| 'already_accepted'`
	// mutation (the #1862 bypass) would turn this into a false "already accepted"
	// cause — this case must be RED under that mutation and GREEN without it.
	{
		name: 'a failure with null reason falls back to other',
		outcome: 'error',
		response: {
			succeededCount: 1,
			failedCount: 1,
			failedItems: [
				{ invitationId: ACCEPTED_B, reason: null as unknown as string },
			],
		},
		errorToastArgs: [
			'Revoked 1 invitation(s), 1 failed.',
			'1 could not be revoked',
		],
	},
	{
		name: 'a failure with empty reason falls back to other',
		outcome: 'error',
		response: {
			succeededCount: 1,
			failedCount: 1,
			failedItems: [{ invitationId: ACCEPTED_B, reason: '' }],
		},
		errorToastArgs: [
			'Revoked 1 invitation(s), 1 failed.',
			'1 could not be revoked',
		],
	},
];

describe('#1387 invitations selection-mode bulk revoke (real router)', () => {
	beforeEach(() => {
		vi.clearAllMocks();

		// The mocked module-level invalidation delegates to whatever QueryClient
		// the caller passes (the page passes the harness's real one), so the
		// post-success test can observe GENUINE cache invalidation state.
		mocks.invalidateStaffInvitations.mockImplementation(
			(queryClient: QueryClient) =>
				queryClient.invalidateQueries({
					queryKey: STAFF_INVITATIONS_SCOPED_KEY,
				}),
		);

		mocks.toInvitationRows.mockImplementation((rows: unknown) => rows);
		mocks.useStaffInvitationsQuery.mockImplementation(() =>
			settledQuery(invitationPayload()),
		);
		mocks.useBulkRevokeMutation.mockReturnValue({
			mutateAsync: mocks.bulkRevoke,
			isPending: false,
		});
		mocks.bulkRevoke.mockResolvedValue({
			succeededCount: 1,
			failedCount: 0,
		});
	});

	afterEach(() => {
		cleanup();
		destroyOpenHistories();
		vi.clearAllMocks();
	});

	test('selection mode exposes Revoke selected, not only export', async () => {
		await renderAtList();

		fireEvent.click(
			screen.getByRole('checkbox', { name: `Select ${PENDING_A}` }),
		);

		const trigger = await screen.findByRole('button', {
			name: 'Bulk actions',
			expanded: false,
		});
		fireEvent.click(trigger);
		await waitFor(() =>
			expect(trigger.getAttribute('aria-expanded')).toBe('true'),
		);

		expect(screen.getByRole('menuitem', { name: 'Revoke selected' }));
	});

	test("the trigger's accessible name equals its visible label (#1400 regression guard)", async () => {
		await renderAtList();

		fireEvent.click(
			screen.getByRole('checkbox', { name: `Select ${PENDING_A}` }),
		);

		const trigger = await screen.findByRole('button', {
			name: 'Bulk actions',
		});
		expect(trigger.getAttribute('aria-label')).toBe('Bulk actions');
		expect(trigger.textContent).toContain('Bulk actions');
	});

	test('a confirmed bulk revoke drives the real route component into the mutation with eligible ids only', async () => {
		await renderAtList();

		// One pending + one accepted invitation selected: eligibility scoping is
		// asserted on the wire format — the accepted id must never reach the API.
		fireEvent.click(
			screen.getByRole('checkbox', { name: `Select ${PENDING_A}` }),
		);
		fireEvent.click(
			screen.getByRole('checkbox', { name: `Select ${ACCEPTED_B}` }),
		);

		await chooseBulkAction('Revoke selected', 'Bulk actions');

		// Destructive action requires a confirmation dialog naming the eligible count.
		expect(
			await screen.findByText(
				'Are you sure you want to revoke 1 selected invitation(s)?',
			),
		).toBeTruthy();
		fireEvent.click(screen.getByRole('button', { name: 'Revoke' }));

		await waitFor(() => expect(mocks.bulkRevoke).toHaveBeenCalledOnce());
		expect(mocks.bulkRevoke).toHaveBeenCalledWith({
			invitationIds: [PENDING_A],
		});
		await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledOnce());
	});

	test.each(BULK_REVOKE_OUTCOME_CASES)(
		'$name response clears the selection, invalidates the list, and renders the outcome',
		async (c) => {
			// Both rows are made pending so BOTH ids are genuinely eligible AND
			// sent; the response shape alone decides what the flow must do next.
			const bothPending = invitationPayload();
			bothPending.data[1]!.status = 'Pending';
			mocks.useStaffInvitationsQuery.mockImplementation(() =>
				settledQuery(bothPending),
			);
			mocks.bulkRevoke.mockResolvedValue(c.response);

			const { queryClient } = await renderAtList();
			// Seed the scoped list entry so the REAL QueryClient can flip it to
			// isInvalidated when the post-mutation bookkeeping runs.
			queryClient.setQueryData(STAFF_INVITATIONS_SCOPED_KEY, { seeded: true });
			expect(
				queryClient.getQueryState(STAFF_INVITATIONS_SCOPED_KEY)?.isInvalidated,
			).toBe(false);

			fireEvent.click(
				screen.getByRole('checkbox', { name: `Select ${PENDING_A}` }),
			);
			fireEvent.click(
				screen.getByRole('checkbox', { name: `Select ${ACCEPTED_B}` }),
			);
			expect(await screen.findByText('2 selected')).toBeTruthy();

			await chooseBulkAction('Revoke selected', 'Bulk actions');
			fireEvent.click(await screen.findByRole('button', { name: 'Revoke' }));

			// Exactly ONE result toast, matching the response shape: the success
			// count on full success, the failure counts PLUS the grouped reasons
			// whenever the body carries failures.
			if (c.outcome === 'error') {
				await waitFor(() =>
					expect(mocks.toastError).toHaveBeenCalledWith(...c.errorToastArgs),
				);
				expect(mocks.toastSuccess).not.toHaveBeenCalled();
			} else {
				await waitFor(() =>
					expect(mocks.toastSuccess).toHaveBeenCalledWith(
						...c.successToastArgs,
					),
				);
				expect(mocks.toastError).not.toHaveBeenCalled();
			}

			// The bookkeeping is UNCONDITIONAL on every 200 shape (r3 MAJOR):
			// genuine invalidation on THIS harness's QueryClient...
			await waitFor(() => {
				expect(mocks.invalidateStaffInvitations).toHaveBeenCalledTimes(1);
				expect(mocks.invalidateStaffInvitations).toHaveBeenCalledWith(
					queryClient,
				);
				expect(
					queryClient.getQueryState(STAFF_INVITATIONS_SCOPED_KEY)
						?.isInvalidated,
				).toBe(true);
			});
			// ...every row checkbox unchecked (the boxes stay mounted; the column
			// is permanent while a selection prop exists)...
			await waitFor(() => {
				expect(
					screen
						.getByRole('checkbox', { name: `Select ${PENDING_A}` })
						.getAttribute('data-checked'),
				).toBeNull();
				expect(
					screen
						.getByRole('checkbox', { name: `Select ${ACCEPTED_B}` })
						.getAttribute('data-checked'),
				).toBeNull();
			});
			// ...and the selection bar leaves after its 220ms exit animation.
			await waitFor(() =>
				expect(screen.queryByTestId('floating-selection-bar')).toBeNull(),
			);
		},
	);

	test('an all-ineligible selection warns without ever opening the dialog or firing the mutation', async () => {
		await renderAtList();

		fireEvent.click(
			screen.getByRole('checkbox', { name: `Select ${ACCEPTED_B}` }),
		);

		await chooseBulkAction('Revoke selected', 'Bulk actions');

		await waitFor(() =>
			expect(mocks.toastWarning).toHaveBeenCalledWith(
				'Only pending invitations can be revoked.',
			),
		);
		expect(screen.queryByText(/revoke .* selected invitation/)).toBeNull();
		expect(mocks.bulkRevoke).not.toHaveBeenCalled();
	});

	test('a partial failure raises the partial-success toast instead of plain success', async () => {
		mocks.bulkRevoke.mockResolvedValue({ succeededCount: 1, failedCount: 2 });

		await renderAtList();

		fireEvent.click(
			screen.getByRole('checkbox', { name: `Select ${PENDING_A}` }),
		);

		await chooseBulkAction('Revoke selected', 'Bulk actions');
		expect(
			await screen.findByText(/revoke 1 selected invitation/),
		).toBeTruthy();
		fireEvent.click(screen.getByRole('button', { name: 'Revoke' }));

		// A response WITHOUT failedItems still shows the aggregate counts, with
		// no reasons line.
		await waitFor(() =>
			expect(mocks.toastError).toHaveBeenCalledWith(
				'Revoked 1 invitation(s), 2 failed.',
				'Some rows may no longer appear in the filtered view.',
			),
		);
		expect(mocks.toastSuccess).not.toHaveBeenCalled();
	});

	test('a partial-success revoke names the per-item failure reasons', async () => {
		// r1 MINOR fix (transparent-failure principle): the 200 body carries
		// failedItems[].reason — the toast must say WHY items failed, not just
		// how many. Both rows are made pending so both ids are genuinely
		// eligible AND sent, making the two-reason response realistic (one got
		// accepted in-flight, one vanished).
		const bothPending = invitationPayload();
		bothPending.data[1]!.status = 'Pending';
		mocks.useStaffInvitationsQuery.mockImplementation(() =>
			settledQuery(bothPending),
		);

		mocks.bulkRevoke.mockResolvedValue({
			succeededCount: 0,
			failedCount: 2,
			failedItems: [
				{ invitationId: PENDING_A, reason: 'already_accepted' },
				{ invitationId: ACCEPTED_B, reason: 'not_found' },
			],
		});

		await renderAtList();

		fireEvent.click(
			screen.getByRole('checkbox', { name: `Select ${PENDING_A}` }),
		);
		fireEvent.click(
			screen.getByRole('checkbox', { name: `Select ${ACCEPTED_B}` }),
		);

		await chooseBulkAction('Revoke selected', 'Bulk actions');
		expect(
			await screen.findByText(/revoke 2 selected invitation/),
		).toBeTruthy();
		fireEvent.click(screen.getByRole('button', { name: 'Revoke' }));

		await waitFor(() =>
			expect(mocks.toastError).toHaveBeenCalledWith(
				'Revoked 0 invitation(s), 2 failed.',
				'1 already accepted; 1 not found',
			),
		);
		expect(mocks.toastSuccess).not.toHaveBeenCalled();
	});

	test('an unknown failure reason falls back to the generic translated reason', async () => {
		// r2 MEDIUM contract: the `-other` fallback. A server-side reason the
		// client has never heard of must render through the TRANSLATED
		// `invitation-bulk-revoke-reason-other` text — never the raw wire
		// string and never a raw i18n key.
		mocks.bulkRevoke.mockResolvedValue({
			succeededCount: 0,
			failedCount: 1,
			failedItems: [
				{ invitationId: PENDING_A, reason: 'storage_quota_exhausted' },
			],
		});

		await renderAtList();

		fireEvent.click(
			screen.getByRole('checkbox', { name: `Select ${PENDING_A}` }),
		);

		await chooseBulkAction('Revoke selected', 'Bulk actions');
		expect(
			await screen.findByText(/revoke 1 selected invitation/),
		).toBeTruthy();
		fireEvent.click(screen.getByRole('button', { name: 'Revoke' }));

		await waitFor(() =>
			expect(mocks.toastError).toHaveBeenCalledWith(
				'Revoked 0 invitation(s), 1 failed.',
				'1 could not be revoked',
			),
		);
		const reasonsText = mocks.toastError.mock.calls[0]?.[1];
		expect(reasonsText).toBe('1 could not be revoked');
		expect(reasonsText).not.toContain('storage_quota_exhausted');
		expect(reasonsText).not.toContain('invitation-bulk-revoke-reason-other');
		expect(mocks.toastSuccess).not.toHaveBeenCalled();
	});

	test('an all-failure revoke without per-item reasons shows the no-reason fallback (#1811)', async () => {
		mocks.bulkRevoke.mockResolvedValue({
			succeededCount: 0,
			failedCount: 1,
		});

		await renderAtList();

		fireEvent.click(
			screen.getByRole('checkbox', { name: `Select ${PENDING_A}` }),
		);
		await chooseBulkAction('Revoke selected', 'Bulk actions');
		fireEvent.click(await screen.findByRole('button', { name: 'Revoke' }));

		await waitFor(() =>
			expect(mocks.toastError).toHaveBeenCalledWith(
				'Revoked 0 invitation(s), 1 failed.',
				"The server didn't specify a reason for this failure. Try again, or contact support if the problem persists.",
			),
		);
		// #1811 : un echec total sans raison par item doit montrer une cause
		// lisible, pas undefined.
		expect(mocks.toastError.mock.calls[0][1]).not.toBeUndefined();
		expect(mocks.toastSuccess).not.toHaveBeenCalled();
	});

	test('an all-failure revoke suppresses the filter-leave warning and surfaces the per-item reason', async () => {
		mocks.bulkRevoke.mockResolvedValue({
			succeededCount: 0,
			failedCount: 1,
			failedItems: [{ invitationId: PENDING_A, reason: 'already_accepted' }],
		});

		await renderAtList();

		fireEvent.click(
			screen.getByRole('checkbox', { name: `Select ${PENDING_A}` }),
		);
		await chooseBulkAction('Revoke selected', 'Bulk actions');
		fireEvent.click(await screen.findByRole('button', { name: 'Revoke' }));

		await waitFor(() =>
			expect(mocks.toastError).toHaveBeenCalledWith(
				'Revoked 0 invitation(s), 1 failed.',
				'1 already accepted',
			),
		);
		// #1605: total failure (succeededCount === 0) carries the per-item
		// reason as description, NOT the filter-leave warning.
		const description = mocks.toastError.mock.calls[0]?.[1];
		expect(description).toBe('1 already accepted');
		expect(description).not.toContain('Some rows may no longer appear');
		expect(mocks.toastSuccess).not.toHaveBeenCalled();
	});

	test('mutation rejection surfaces a transparent local failure message', async () => {
		mocks.bulkRevoke.mockRejectedValue(new Error('boom'));

		await renderAtList();

		fireEvent.click(
			screen.getByRole('checkbox', { name: `Select ${PENDING_A}` }),
		);

		await chooseBulkAction('Revoke selected', 'Bulk actions');
		expect(
			await screen.findByText(/revoke 1 selected invitation/),
		).toBeTruthy();
		fireEvent.click(screen.getByRole('button', { name: 'Revoke' }));

		await waitFor(() =>
			expect(mocks.displayLocalMutationFailure).toHaveBeenCalledWith(
				expect.anything(),
				'Failed to revoke selected invitations.',
			),
		);
		expect(mocks.toastSuccess).not.toHaveBeenCalled();
	});
});
