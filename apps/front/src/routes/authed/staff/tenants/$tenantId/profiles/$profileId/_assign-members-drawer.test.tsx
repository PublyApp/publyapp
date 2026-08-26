/**
 * @vitest-environment jsdom
 */
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from '@testing-library/react';
import type { JSX } from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { TestLabelMap } from '~/lib/testing/test-label-map';

const mocks = vi.hoisted(() => ({
	invalidateQueries: vi.fn().mockResolvedValue(undefined),
	useStaffTenantUsersQuery: vi.fn(),
	useStaffTenantProfileMemberAssignmentResolutionQuery: vi.fn(),
	resolutionRefetch: vi.fn(),
	assignMutateAsync: vi.fn(),
	unassignMutateAsync: vi.fn(),
	shouldLogoutForFailure: vi.fn(() => false),
}));

vi.mock('@tanstack/react-query', () => ({
	useQueryClient: () => ({
		invalidateQueries: mocks.invalidateQueries,
	}),
}));

vi.mock('@tanstack/react-router', () => ({
	Link: ({
		children,
		to,
		params,
		...props
	}: {
		children: React.ReactNode;
		to: string;
		params?: Record<string, string>;
	}) => {
		let href = to;

		for (const [key, value] of Object.entries(params ?? {})) {
			href = href.replace(`$${key}`, value);
		}

		return (
			<a href={href} {...props}>
				{children}
			</a>
		);
	},
}));

const TRANSLATIONS: TestLabelMap = {
	members: 'Members',
	'assign-members': 'Assign members',
	'assign-members-drawer-description':
		'Toggle a tenant member on to assign this profile, or off to remove it. Changes save immediately.',
	'assign-member-toggle-label': 'Toggle profile assignment for {{name}}',
	'no-tenant-members-to-assign': 'There are no tenant members to assign yet.',
	'assign-members-resolution-error-title':
		"Can't confirm who's already assigned",
	'assign-members-resolution-error-description':
		"We couldn't check current assignment status. Toggles stay disabled until this is retried.",
	'tenant-users-no-match-title': 'No members match your search',
	'tenant-users-no-match-description':
		'Try a different name, email, or filter.',
	'search-tenant-members': 'Search members by name or email…',
	close: 'Close',
	retry: 'Retry',
	'page-n': 'Page {{page}}',
	'previous-page': 'Previous page',
	'next-page': 'Next page',
};

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string, options?: Record<string, unknown>) => {
			let text = TRANSLATIONS[key] ?? key;
			if (!options) {
				return text;
			}
			for (const [optionKey, value] of Object.entries(options)) {
				text = text.replaceAll(`{{${optionKey}}}`, String(value));
			}
			return text;
		},
	}),
}));

vi.mock('~/lib/query/staff-tenant-profiles', () => ({
	useAssignStaffTenantProfileUserMutation: () => ({
		mutateAsync: mocks.assignMutateAsync,
	}),
	useUnassignStaffTenantProfileUserMutation: () => ({
		mutateAsync: mocks.unassignMutateAsync,
	}),
	useStaffTenantProfileMemberAssignmentResolutionQuery:
		mocks.useStaffTenantProfileMemberAssignmentResolutionQuery,
	toStaffTenantProfileMemberAssignmentMap: (
		result:
			| { assignments?: { userAccountId?: string; isAssigned?: boolean }[] }
			| null
			| undefined,
	) => {
		const map: Record<string, boolean> = {};
		for (const assignment of result?.assignments ?? []) {
			if (!assignment.userAccountId) {
				continue;
			}
			map[assignment.userAccountId] = assignment.isAssigned === true;
		}
		return map;
	},
}));

// FIXTURE IDENTITY CONTRACT (step4b-review BLOCKER 1): every fixture row's
// `id` (the global user id) is DELIBERATELY a different literal string from
// its `userAccountId` (the tenant membership id). If the component ever
// regresses to reading `row.id` for resolve/assign/unassign, an assertion
// checking for the `account-*` value will fail against the `user-*` value
// actually sent — a conflated fixture (same string for both) would make that
// assertion vacuously pass either way.
vi.mock('~/lib/query/staff-tenant-users', () => ({
	useStaffTenantUsersQuery: mocks.useStaffTenantUsersQuery,
	toStaffTenantUserRows: (
		items:
			| {
					id?: string;
					userAccountId?: string;
					email?: string;
					firstName?: string | null;
					lastName?: string | null;
			  }[]
			| null
			| undefined,
	) =>
		(items ?? []).map((item) => ({
			id: item.id ?? '',
			userAccountId: item.userAccountId ?? '',
			email: item.email ?? '',
			firstName: item.firstName ?? null,
			lastName: item.lastName ?? null,
			avatarUrl: null,
			status: 'active',
			displayName:
				[item.firstName, item.lastName].filter(Boolean).join(' ') ||
				item.email ||
				'',
		})),
}));

vi.mock('~/lib/query/staff-tenants', () => ({
	invalidateAllStaffTenantScopes: mocks.invalidateQueries,
}));

vi.mock('@org/shared-ts/lib/should-logout-for-failure', () => ({
	shouldLogoutForFailure: mocks.shouldLogoutForFailure,
}));

import { AssignMembersDrawer } from './_assign-members-drawer';

const TENANT_ID = 'tenant-1';

const FIXTURE_USERS = [
	{
		id: 'user-1',
		userAccountId: 'account-1',
		email: 'ada@example.com',
		firstName: 'Ada',
		lastName: 'Lovelace',
	},
	{
		id: 'user-2',
		userAccountId: 'account-2',
		email: 'grace@example.com',
		firstName: 'Grace',
		lastName: 'Hopper',
	},
];

const OTHER_PAGE_FIXTURE_USERS = [
	{
		id: 'user-3',
		userAccountId: 'account-3',
		email: 'katherine@example.com',
		firstName: 'Katherine',
		lastName: 'Johnson',
	},
];

const renderDrawer = (
	overrides: Partial<Parameters<typeof AssignMembersDrawer>[0]> = {},
): ReturnType<typeof render> => {
	const props = {
		tenantId: TENANT_ID,
		profileId: 'profile-1',
		isOpen: true,
		onOpenChange: vi.fn(),
		onSessionExpired: vi.fn(),
		...overrides,
	};

	return render((<AssignMembersDrawer {...props} />) as JSX.Element);
};

/** Default: both fixture members are RESOLVED (a real resolve answer exists)
 * and unassigned — matches the shape most tests need (enabled, unchecked
 * switches) without every test having to restate it. */
const resolvedUnassigned = (
	assignments: { userAccountId: string; isAssigned: boolean }[] = [
		{ userAccountId: 'account-1', isAssigned: false },
		{ userAccountId: 'account-2', isAssigned: false },
	],
) => ({
	data: { assignments },
	isPending: false,
	isError: false,
	refetch: mocks.resolutionRefetch,
});

beforeEach(() => {
	vi.clearAllMocks();
	mocks.useStaffTenantUsersQuery.mockReturnValue({
		data: { data: FIXTURE_USERS, nextCursor: null },
		isPending: false,
		isError: false,
		isFetching: false,
		refetch: vi.fn(),
	});
	mocks.useStaffTenantProfileMemberAssignmentResolutionQuery.mockReturnValue(
		resolvedUnassigned(),
	);
	mocks.assignMutateAsync.mockResolvedValue(undefined);
	mocks.unassignMutateAsync.mockResolvedValue(undefined);
});

afterEach(() => {
	cleanup();
});

describe('AssignMembersDrawer', () => {
	test('renders assignable tenant members with an unchecked, enabled toggle per row once resolved', () => {
		renderDrawer();

		expect(screen.getByTestId('assign-members-drawer')).toBeTruthy();
		expect(screen.getByText('Ada Lovelace')).toBeTruthy();
		expect(screen.getByText('Grace Hopper')).toBeTruthy();

		const adaToggle = screen.getByTestId('assign-member-toggle-account-1');
		expect(adaToggle.getAttribute('aria-checked')).toBe('false');
		expect(adaToggle.getAttribute('aria-disabled')).toBeNull();
	});

	// step4b-rereview MAJOR 5: every list table's first cell must be a record
	// Link, and it must navigate with the GLOBAL user id (not the account id
	// used for membership ops).
	test('renders the first column as a record Link to the global-user-id detail route', () => {
		renderDrawer();

		const adaLink = screen.getByText('Ada Lovelace').closest('a');
		expect(adaLink?.getAttribute('href')).toBe(
			`/staff/tenants/${TENANT_ID}/users/user-1`,
		);
		expect(screen.getByText('Ada Lovelace').className).toContain(
			'publy-record-link',
		);
	});

	// step4b-review MAJOR 3: a row must not be actionable before we have an
	// authoritative answer for it — otherwise an actually-assigned member can
	// look available to assign.
	test('disables a row until the resolve read has an answer for it, and enables it once resolved', () => {
		mocks.useStaffTenantProfileMemberAssignmentResolutionQuery.mockReturnValue({
			data: undefined,
			isPending: true,
			isError: false,
			refetch: mocks.resolutionRefetch,
		});

		const { rerender } = renderDrawer();

		const toggle = screen.getByTestId('assign-member-toggle-account-1');
		expect(toggle.getAttribute('aria-disabled')).toBe('true');

		mocks.useStaffTenantProfileMemberAssignmentResolutionQuery.mockReturnValue(
			resolvedUnassigned(),
		);
		rerender(
			(
				<AssignMembersDrawer
					tenantId={TENANT_ID}
					profileId="profile-1"
					isOpen
					onOpenChange={() => {}}
					onSessionExpired={() => {}}
				/>
			) as JSX.Element,
		);

		expect(
			screen
				.getByTestId('assign-member-toggle-account-1')
				.getAttribute('aria-disabled'),
		).toBeNull();
	});

	// step4b-rereview MAJOR 3: a resolve failure must be persistent and
	// recoverable (docs/guides/front/conventions.md:160-164), not a silent
	// permanently-disabled dead end.
	test('shows a persistent resolution-error state with a retry action when the resolve read fails', () => {
		mocks.useStaffTenantProfileMemberAssignmentResolutionQuery.mockReturnValue({
			data: undefined,
			isPending: false,
			isError: true,
			refetch: mocks.resolutionRefetch,
		});

		renderDrawer();

		expect(screen.getByTestId('assign-members-resolution-error')).toBeTruthy();
		expect(
			screen.getByText("Can't confirm who's already assigned"),
		).toBeTruthy();

		fireEvent.click(screen.getByText('Retry'));
		expect(mocks.resolutionRefetch).toHaveBeenCalledTimes(1);

		// Still disabled — a failed read is not an authoritative answer.
		expect(
			screen
				.getByTestId('assign-member-toggle-account-1')
				.getAttribute('aria-disabled'),
		).toBe('true');
	});

	test('does not show the resolution-error state while the resolve read is healthy', () => {
		renderDrawer();

		expect(screen.queryByTestId('assign-members-resolution-error')).toBeNull();
	});

	// step4b-review BLOCKER 1: the resolve endpoint requires user_account_id,
	// never the global user id.
	test('sends the tenant-membership userAccountId (not the global user id) to the resolve read', () => {
		renderDrawer();

		const lastCall =
			mocks.useStaffTenantProfileMemberAssignmentResolutionQuery.mock.calls[
				mocks.useStaffTenantProfileMemberAssignmentResolutionQuery.mock.calls
					.length - 1
			];
		expect(lastCall?.[0]).toMatchObject({
			tenantId: TENANT_ID,
			profileId: 'profile-1',
			userAccountIds: ['account-1', 'account-2'],
		});
		expect(typeof lastCall?.[0]?.generation).toBe('number');
		expect(lastCall?.[1]?.enabled).toBe(true);
	});

	test('seeds a row as checked when the resolve-assignment read reports it already assigned', () => {
		mocks.useStaffTenantProfileMemberAssignmentResolutionQuery.mockReturnValue(
			resolvedUnassigned([
				{ userAccountId: 'account-1', isAssigned: true },
				{ userAccountId: 'account-2', isAssigned: false },
			]),
		);

		renderDrawer();

		expect(
			screen
				.getByTestId('assign-member-toggle-account-1')
				.getAttribute('aria-checked'),
		).toBe('true');
		expect(
			screen
				.getByTestId('assign-member-toggle-account-2')
				.getAttribute('aria-checked'),
		).toBe('false');
	});

	test('toggling a row on fires exactly one assign POST keyed by userAccountId, never the global user id', async () => {
		renderDrawer();

		fireEvent.click(screen.getByTestId('assign-member-toggle-account-1'));

		await waitFor(() => {
			expect(mocks.assignMutateAsync).toHaveBeenCalledTimes(1);
		});
		expect(mocks.assignMutateAsync).toHaveBeenCalledWith({
			tenantId: TENANT_ID,
			profileId: 'profile-1',
			userAccountId: 'account-1',
		});
		expect(mocks.unassignMutateAsync).not.toHaveBeenCalled();

		// Re-query rather than reuse the pre-click element reference — a
		// controlled Base UI Switch re-renders its DOM node on state change.
		await waitFor(() => {
			expect(
				screen
					.getByTestId('assign-member-toggle-account-1')
					.getAttribute('aria-checked'),
			).toBe('true');
		});
		await waitFor(() => {
			expect(mocks.invalidateQueries).toHaveBeenCalled();
		});
	});

	test('toggling a row off fires exactly one unassign DELETE keyed by userAccountId', async () => {
		renderDrawer();

		// First toggle on, then off — mirrors a staff admin correcting a
		// just-made assignment within the same drawer session.
		fireEvent.click(screen.getByTestId('assign-member-toggle-account-1'));
		await waitFor(() => {
			expect(
				screen
					.getByTestId('assign-member-toggle-account-1')
					.getAttribute('aria-checked'),
			).toBe('true');
		});

		fireEvent.click(screen.getByTestId('assign-member-toggle-account-1'));
		await waitFor(() => {
			expect(mocks.unassignMutateAsync).toHaveBeenCalledTimes(1);
		});
		expect(mocks.unassignMutateAsync).toHaveBeenCalledWith({
			tenantId: TENANT_ID,
			profileId: 'profile-1',
			userAccountId: 'account-1',
		});
		await waitFor(() => {
			expect(
				screen
					.getByTestId('assign-member-toggle-account-1')
					.getAttribute('aria-checked'),
			).toBe('false');
		});
	});

	test('reverts the optimistic toggle when the assign mutation fails', async () => {
		mocks.assignMutateAsync.mockRejectedValueOnce(new Error('cap exceeded'));
		renderDrawer();

		fireEvent.click(screen.getByTestId('assign-member-toggle-account-1'));

		await waitFor(() => {
			expect(mocks.assignMutateAsync).toHaveBeenCalledTimes(1);
		});
		await waitFor(() => {
			expect(
				screen
					.getByTestId('assign-member-toggle-account-1')
					.getAttribute('aria-checked'),
			).toBe('false');
		});
		// A local, non-401 failure never triggers a session-expiry redirect.
		expect(mocks.shouldLogoutForFailure).toHaveBeenCalled();
	});

	test('toggling a resolved-as-assigned row off still fires the unassign DELETE', async () => {
		mocks.useStaffTenantProfileMemberAssignmentResolutionQuery.mockReturnValue(
			resolvedUnassigned([{ userAccountId: 'account-1', isAssigned: true }]),
		);

		renderDrawer();

		expect(
			screen
				.getByTestId('assign-member-toggle-account-1')
				.getAttribute('aria-checked'),
		).toBe('true');

		fireEvent.click(screen.getByTestId('assign-member-toggle-account-1'));

		await waitFor(() => {
			expect(mocks.unassignMutateAsync).toHaveBeenCalledTimes(1);
		});
		expect(mocks.assignMutateAsync).not.toHaveBeenCalled();
	});

	// step4b-rereview MAJOR 2: a committed write must bump the resolve
	// generation so the NEXT resolve fetch is issued under a brand-new query
	// key — proves the component issues the cache-key-busting request the
	// generation-guard design depends on (the genuine cross-generation race
	// itself is exercised end-to-end in
	// _assign-members-drawer.race.test.tsx, which drives a real query client).
	test('bumps the resolve generation after a successful toggle, forcing a fresh resolve request', async () => {
		renderDrawer();

		const callsBefore =
			mocks.useStaffTenantProfileMemberAssignmentResolutionQuery.mock.calls
				.length;
		const generationBefore =
			mocks.useStaffTenantProfileMemberAssignmentResolutionQuery.mock.calls[
				callsBefore - 1
			]?.[0]?.generation;

		fireEvent.click(screen.getByTestId('assign-member-toggle-account-1'));

		await waitFor(() => {
			expect(mocks.invalidateQueries).toHaveBeenCalled();
		});

		const callsAfter =
			mocks.useStaffTenantProfileMemberAssignmentResolutionQuery.mock.calls;
		const generationAfter = callsAfter.at(-1)?.[0]?.generation;

		expect(callsAfter.length).toBeGreaterThan(callsBefore);
		expect(generationAfter).toBeGreaterThan(generationBefore);
	});

	// step4b-rereview MAJOR 2: resolved truth is scoped to the CURRENT result
	// key. Revisiting/changing the candidate page must not render a
	// different, no-longer-in-view id as still "resolved" (and therefore
	// actionable) — the effect must prune, not accumulate.
	test('a new candidate page renders its rows disabled until resolved, never inheriting a previous page’s resolved ids', () => {
		const { rerender } = renderDrawer();

		expect(
			screen
				.getByTestId('assign-member-toggle-account-1')
				.getAttribute('aria-disabled'),
		).toBeNull();

		mocks.useStaffTenantUsersQuery.mockReturnValue({
			data: { data: OTHER_PAGE_FIXTURE_USERS, nextCursor: null },
			isPending: false,
			isError: false,
			isFetching: false,
			refetch: vi.fn(),
		});
		mocks.useStaffTenantProfileMemberAssignmentResolutionQuery.mockReturnValue({
			data: undefined,
			isPending: true,
			isError: false,
			refetch: mocks.resolutionRefetch,
		});
		rerender(
			(
				<AssignMembersDrawer
					tenantId={TENANT_ID}
					profileId="profile-1"
					isOpen
					onOpenChange={() => {}}
					onSessionExpired={() => {}}
				/>
			) as JSX.Element,
		);

		expect(screen.queryByText('Ada Lovelace')).toBeNull();
		expect(
			screen
				.getByTestId('assign-member-toggle-account-3')
				.getAttribute('aria-disabled'),
		).toBe('true');
	});

	// step4b-r3-rereview finding 1(A): away/back must re-enable a page whose
	// resolve answer is still CACHED. TanStack Query serves the identical
	// response object for a query within its default staleTime (30s,
	// router.tsx) — a dedup guard keyed by object identity alone (with no
	// reset on scope change) would treat "returning to A" as "already
	// applied" and never restore A's pruned resolvedIds/assignedIds, leaving
	// the switches stuck disabled with no error to retry (the query
	// succeeded). This test fails against the pre-fix code for exactly that
	// reason and passes once the applied-response marker is reset whenever
	// the row-account-id scope changes.
	test('returning to a page while its cached resolve answer is still fresh re-enables its rows instead of leaving them stuck disabled', () => {
		// The SAME object reference is reused for both the initial visit and
		// the return visit below — deliberately modeling "TanStack Query handed
		// back the identical cached entry," not a fresh network response.
		const pageAResolved = resolvedUnassigned([
			{ userAccountId: 'account-1', isAssigned: true },
			{ userAccountId: 'account-2', isAssigned: false },
		]);
		mocks.useStaffTenantProfileMemberAssignmentResolutionQuery.mockReturnValue(
			pageAResolved,
		);

		const { rerender } = renderDrawer();

		expect(
			screen
				.getByTestId('assign-member-toggle-account-1')
				.getAttribute('aria-checked'),
		).toBe('true');
		expect(
			screen
				.getByTestId('assign-member-toggle-account-1')
				.getAttribute('aria-disabled'),
		).toBeNull();

		// Navigate to page B while B's own resolve request is still pending.
		mocks.useStaffTenantUsersQuery.mockReturnValue({
			data: { data: OTHER_PAGE_FIXTURE_USERS, nextCursor: null },
			isPending: false,
			isError: false,
			isFetching: false,
			refetch: vi.fn(),
		});
		mocks.useStaffTenantProfileMemberAssignmentResolutionQuery.mockReturnValue({
			data: undefined,
			isPending: true,
			isError: false,
			refetch: mocks.resolutionRefetch,
		});
		rerender(
			(
				<AssignMembersDrawer
					tenantId={TENANT_ID}
					profileId="profile-1"
					isOpen
					onOpenChange={() => {}}
					onSessionExpired={() => {}}
				/>
			) as JSX.Element,
		);

		expect(screen.queryByText('Ada Lovelace')).toBeNull();
		expect(
			screen
				.getByTestId('assign-member-toggle-account-3')
				.getAttribute('aria-disabled'),
		).toBe('true');

		// Return to page A quickly — the mock hands back the EXACT SAME
		// `pageAResolved` object, exactly as TanStack Query would for a
		// still-fresh cache entry.
		mocks.useStaffTenantUsersQuery.mockReturnValue({
			data: { data: FIXTURE_USERS, nextCursor: null },
			isPending: false,
			isError: false,
			isFetching: false,
			refetch: vi.fn(),
		});
		mocks.useStaffTenantProfileMemberAssignmentResolutionQuery.mockReturnValue(
			pageAResolved,
		);
		rerender(
			(
				<AssignMembersDrawer
					tenantId={TENANT_ID}
					profileId="profile-1"
					isOpen
					onOpenChange={() => {}}
					onSessionExpired={() => {}}
				/>
			) as JSX.Element,
		);

		expect(screen.getByText('Ada Lovelace')).toBeTruthy();
		const adaToggle = screen.getByTestId('assign-member-toggle-account-1');
		expect(adaToggle.getAttribute('aria-disabled')).toBeNull();
		expect(adaToggle.getAttribute('aria-checked')).toBe('true');
	});

	// step4b-r3-rereview finding 1(B): pruning must never forget a LIVE write.
	// If a row's mutation is still pending when it scrolls out of view (a
	// page/search change) and the row later comes back before that mutation
	// settles, the switch must stay disabled the whole time — never
	// re-enabled by a scope change, which would let a second click fire a
	// duplicate assign/unassign call. This test fails against the pre-fix
	// code (which pruned `pendingIds` alongside `assignedIds`/`resolvedIds`
	// on every scope change) and passes once pending operations survive scope
	// changes and are cleared only when their own mutation settles.
	test('an in-flight toggle survives its row scrolling out of view and back, and cannot be double-fired', async () => {
		let resolveAssign: (() => void) | undefined;
		mocks.assignMutateAsync.mockImplementation(
			() =>
				new Promise<void>((resolve) => {
					resolveAssign = resolve;
				}),
		);

		const { rerender } = renderDrawer();

		fireEvent.click(screen.getByTestId('assign-member-toggle-account-1'));

		// Optimistically pending immediately — the mutation has not settled.
		await waitFor(() => {
			expect(mocks.assignMutateAsync).toHaveBeenCalledTimes(1);
		});
		expect(
			screen
				.getByTestId('assign-member-toggle-account-1')
				.getAttribute('aria-disabled'),
		).toBe('true');

		// The row scrolls out of view (candidate page/search changes) WHILE the
		// write is still in flight, and a fresh resolve response for the new
		// page reports (correctly, for THAT page) nothing relevant to account-1.
		mocks.useStaffTenantUsersQuery.mockReturnValue({
			data: { data: OTHER_PAGE_FIXTURE_USERS, nextCursor: null },
			isPending: false,
			isError: false,
			isFetching: false,
			refetch: vi.fn(),
		});
		mocks.useStaffTenantProfileMemberAssignmentResolutionQuery.mockReturnValue(
			resolvedUnassigned([{ userAccountId: 'account-3', isAssigned: false }]),
		);
		rerender(
			(
				<AssignMembersDrawer
					tenantId={TENANT_ID}
					profileId="profile-1"
					isOpen
					onOpenChange={() => {}}
					onSessionExpired={() => {}}
				/>
			) as JSX.Element,
		);
		expect(screen.queryByText('Ada Lovelace')).toBeNull();

		// The row comes back into view WHILE the mutation is still pending —
		// simulate a resolve answer for the ORIGINAL page reporting the
		// PRE-write ("false") state, exactly what a cached/refetched answer
		// unaware of the in-flight write would say.
		mocks.useStaffTenantUsersQuery.mockReturnValue({
			data: { data: FIXTURE_USERS, nextCursor: null },
			isPending: false,
			isError: false,
			isFetching: false,
			refetch: vi.fn(),
		});
		mocks.useStaffTenantProfileMemberAssignmentResolutionQuery.mockReturnValue(
			resolvedUnassigned(),
		);
		rerender(
			(
				<AssignMembersDrawer
					tenantId={TENANT_ID}
					profileId="profile-1"
					isOpen
					onOpenChange={() => {}}
					onSessionExpired={() => {}}
				/>
			) as JSX.Element,
		);

		// Still disabled — the write has not settled yet. A user cannot fire a
		// second click here no matter what a stale/cached resolve answer says.
		expect(
			screen
				.getByTestId('assign-member-toggle-account-1')
				.getAttribute('aria-disabled'),
		).toBe('true');
		fireEvent.click(screen.getByTestId('assign-member-toggle-account-1'));
		expect(mocks.assignMutateAsync).toHaveBeenCalledTimes(1);
		expect(mocks.unassignMutateAsync).not.toHaveBeenCalled();

		// Now let the original write settle.
		resolveAssign?.();
		await waitFor(() => {
			expect(
				screen
					.getByTestId('assign-member-toggle-account-1')
					.getAttribute('aria-disabled'),
			).toBeNull();
		});
		expect(
			screen
				.getByTestId('assign-member-toggle-account-1')
				.getAttribute('aria-checked'),
		).toBe('true');
		// Exactly one write total — no duplicate fired while pending.
		expect(mocks.assignMutateAsync).toHaveBeenCalledTimes(1);
	});

	test('calls onOpenChange(false) when the footer Close button is clicked', () => {
		const onOpenChange = vi.fn();
		renderDrawer({ onOpenChange });

		fireEvent.click(screen.getByText('Close'));

		expect(onOpenChange).toHaveBeenCalledWith(false);
	});

	test('does not fetch tenant members while the drawer is closed', () => {
		renderDrawer({ isOpen: false });

		const lastCall =
			mocks.useStaffTenantUsersQuery.mock.calls[
				mocks.useStaffTenantUsersQuery.mock.calls.length - 1
			];
		expect(lastCall?.[1]).toEqual({ enabled: false });
	});

	test('does not resolve assignments while the drawer is closed', () => {
		renderDrawer({ isOpen: false });

		const lastCall =
			mocks.useStaffTenantProfileMemberAssignmentResolutionQuery.mock.calls[
				mocks.useStaffTenantProfileMemberAssignmentResolutionQuery.mock.calls
					.length - 1
			];
		expect(lastCall?.[1]?.enabled).toBe(false);
	});
});
