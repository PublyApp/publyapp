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

const mocks = vi.hoisted(() => ({
	invalidateQueries: vi.fn().mockResolvedValue(undefined),
	useStaffTenantUsersQuery: vi.fn(),
	useStaffTenantProfileMemberAssignmentResolutionQuery: vi.fn(),
	assignMutateAsync: vi.fn(),
	unassignMutateAsync: vi.fn(),
	shouldLogoutForFailure: vi.fn(() => false),
}));

vi.mock('@tanstack/react-query', () => ({
	useQueryClient: () => ({
		invalidateQueries: mocks.invalidateQueries,
	}),
}));

const TRANSLATIONS: Record<string, string> = {
	members: 'Members',
	'assign-members': 'Assign members',
	'assign-members-drawer-description':
		'Toggle a tenant member on to assign this profile, or off to remove it. Changes save immediately.',
	'assign-member-toggle-label': 'Toggle profile assignment for {{name}}',
	'no-tenant-members-to-assign': 'There are no tenant members to assign yet.',
	'tenant-users-no-match-title': 'No members match your search',
	'tenant-users-no-match-description':
		'Try a different name, email, or filter.',
	'search-tenant-members': 'Search members by name or email…',
	close: 'Close',
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

vi.mock('~/lib/should-logout-for-failure', () => ({
	shouldLogoutForFailure: mocks.shouldLogoutForFailure,
}));

import { AssignMembersDrawer } from './_assign-members-drawer';

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

const renderDrawer = (
	overrides: Partial<Parameters<typeof AssignMembersDrawer>[0]> = {},
): ReturnType<typeof render> => {
	const props = {
		tenantId: 'tenant-1',
		profileId: 'profile-1',
		isOpen: true,
		onOpenChange: vi.fn(),
		onSessionExpired: vi.fn(),
		...overrides,
	};

	return render((<AssignMembersDrawer {...props} />) as unknown as JSX.Element);
};

/** Default: both fixture members are RESOLVED (a real resolve answer exists)
 * and unassigned — matches the shape most tests need (enabled, unchecked
 * switches) without every test having to restate it. */
const resolvedUnassigned = (dataUpdatedAt = 1000) => ({
	data: {
		assignments: [
			{ userAccountId: 'account-1', isAssigned: false },
			{ userAccountId: 'account-2', isAssigned: false },
		],
	},
	dataUpdatedAt,
	isPending: false,
	isError: false,
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

	// step4b-review MAJOR 3: a row must not be actionable before we have an
	// authoritative answer for it — otherwise an actually-assigned member can
	// look available to assign.
	test('disables a row until the resolve read has an answer for it, and enables it once resolved', () => {
		mocks.useStaffTenantProfileMemberAssignmentResolutionQuery.mockReturnValue({
			data: undefined,
			dataUpdatedAt: 0,
			isPending: true,
			isError: false,
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
					tenantId="tenant-1"
					profileId="profile-1"
					isOpen
					onOpenChange={() => {}}
					onSessionExpired={() => {}}
				/>
			) as unknown as JSX.Element,
		);

		expect(
			screen
				.getByTestId('assign-member-toggle-account-1')
				.getAttribute('aria-disabled'),
		).toBeNull();
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
		expect(lastCall?.[0]).toEqual({
			tenantId: 'tenant-1',
			profileId: 'profile-1',
			userAccountIds: ['account-1', 'account-2'],
		});
		expect(lastCall?.[1]?.enabled).toBe(true);
	});

	test('seeds a row as checked when the resolve-assignment read reports it already assigned', () => {
		mocks.useStaffTenantProfileMemberAssignmentResolutionQuery.mockReturnValue({
			data: {
				assignments: [
					{ userAccountId: 'account-1', isAssigned: true },
					{ userAccountId: 'account-2', isAssigned: false },
				],
			},
			dataUpdatedAt: 1000,
			isPending: false,
			isError: false,
		});

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
			tenantId: 'tenant-1',
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
			tenantId: 'tenant-1',
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
		mocks.useStaffTenantProfileMemberAssignmentResolutionQuery.mockReturnValue({
			data: {
				assignments: [{ userAccountId: 'account-1', isAssigned: true }],
			},
			dataUpdatedAt: 1000,
			isPending: false,
			isError: false,
		});

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

	// step4b-review MAJOR 3: a resolve response fetched BEFORE a since-
	// committed local write must never clobber it, even if that response is
	// the most RECENT one the component has seen.
	test('ignores a stale resolve response (older dataUpdatedAt) that contradicts a since-committed write', async () => {
		const { rerender } = renderDrawer();

		fireEvent.click(screen.getByTestId('assign-member-toggle-account-1'));
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

		// A resolve response that predates the commit (dataUpdatedAt=1, far
		// below any real Date.now() the commit could have recorded) lands and
		// disagrees (reports account-1 as NOT assigned). It must be ignored for
		// account-1 specifically.
		mocks.useStaffTenantProfileMemberAssignmentResolutionQuery.mockReturnValue({
			data: {
				assignments: [
					{ userAccountId: 'account-1', isAssigned: false },
					{ userAccountId: 'account-2', isAssigned: false },
				],
			},
			dataUpdatedAt: 1,
			isPending: false,
			isError: false,
		});
		rerender(
			(
				<AssignMembersDrawer
					tenantId="tenant-1"
					profileId="profile-1"
					isOpen
					onOpenChange={() => {}}
					onSessionExpired={() => {}}
				/>
			) as unknown as JSX.Element,
		);

		expect(
			screen
				.getByTestId('assign-member-toggle-account-1')
				.getAttribute('aria-checked'),
		).toBe('true');
	});

	// step4b-review MAJOR 3: a fresh resolve response replaces truth for
	// exactly the ids it describes — it is not a one-way, only-ever-adds
	// merge. A member unassigned elsewhere must show unchecked once a newer
	// response says so.
	test('replaces a row from unassigned to assigned (and back) as fresh resolve responses land', () => {
		const { rerender } = renderDrawer();

		expect(
			screen
				.getByTestId('assign-member-toggle-account-1')
				.getAttribute('aria-checked'),
		).toBe('false');

		mocks.useStaffTenantProfileMemberAssignmentResolutionQuery.mockReturnValue({
			data: {
				assignments: [
					{ userAccountId: 'account-1', isAssigned: true },
					{ userAccountId: 'account-2', isAssigned: false },
				],
			},
			dataUpdatedAt: 2000,
			isPending: false,
			isError: false,
		});
		rerender(
			(
				<AssignMembersDrawer
					tenantId="tenant-1"
					profileId="profile-1"
					isOpen
					onOpenChange={() => {}}
					onSessionExpired={() => {}}
				/>
			) as unknown as JSX.Element,
		);

		expect(
			screen
				.getByTestId('assign-member-toggle-account-1')
				.getAttribute('aria-checked'),
		).toBe('true');

		mocks.useStaffTenantProfileMemberAssignmentResolutionQuery.mockReturnValue({
			data: {
				assignments: [
					{ userAccountId: 'account-1', isAssigned: false },
					{ userAccountId: 'account-2', isAssigned: false },
				],
			},
			dataUpdatedAt: 3000,
			isPending: false,
			isError: false,
		});
		rerender(
			(
				<AssignMembersDrawer
					tenantId="tenant-1"
					profileId="profile-1"
					isOpen
					onOpenChange={() => {}}
					onSessionExpired={() => {}}
				/>
			) as unknown as JSX.Element,
		);

		expect(
			screen
				.getByTestId('assign-member-toggle-account-1')
				.getAttribute('aria-checked'),
		).toBe('false');
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
