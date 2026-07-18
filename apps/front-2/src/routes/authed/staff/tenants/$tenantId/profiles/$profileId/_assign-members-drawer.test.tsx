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

vi.mock('~/lib/query/staff-tenant-users', () => ({
	useStaffTenantUsersQuery: mocks.useStaffTenantUsersQuery,
	toStaffTenantUserRows: (
		items:
			| {
					id?: string;
					email?: string;
					firstName?: string | null;
					lastName?: string | null;
			  }[]
			| null
			| undefined,
	) =>
		(items ?? []).map((item) => ({
			id: item.id ?? '',
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
		email: 'ada@example.com',
		firstName: 'Ada',
		lastName: 'Lovelace',
	},
	{
		id: 'user-2',
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

beforeEach(() => {
	vi.clearAllMocks();
	mocks.useStaffTenantUsersQuery.mockReturnValue({
		data: { data: FIXTURE_USERS, nextCursor: null },
		isPending: false,
		isError: false,
		isFetching: false,
		refetch: vi.fn(),
	});
	mocks.useStaffTenantProfileMemberAssignmentResolutionQuery.mockReturnValue({
		data: { assignments: [] },
		isPending: false,
		isError: false,
	});
	mocks.assignMutateAsync.mockResolvedValue(undefined);
	mocks.unassignMutateAsync.mockResolvedValue(undefined);
});

afterEach(() => {
	cleanup();
});

describe('AssignMembersDrawer', () => {
	test('renders assignable tenant members with an unchecked toggle per row', () => {
		renderDrawer();

		expect(screen.getByTestId('assign-members-drawer')).toBeTruthy();
		expect(screen.getByText('Ada Lovelace')).toBeTruthy();
		expect(screen.getByText('Grace Hopper')).toBeTruthy();

		const adaToggle = screen.getByTestId('assign-member-toggle-user-1');
		expect(adaToggle.getAttribute('aria-checked')).toBe('false');
	});

	test('toggling a row on fires exactly one assign POST for that member', async () => {
		renderDrawer();

		fireEvent.click(screen.getByTestId('assign-member-toggle-user-1'));

		await waitFor(() => {
			expect(mocks.assignMutateAsync).toHaveBeenCalledTimes(1);
		});
		expect(mocks.assignMutateAsync).toHaveBeenCalledWith({
			tenantId: 'tenant-1',
			profileId: 'profile-1',
			userAccountId: 'user-1',
		});
		expect(mocks.unassignMutateAsync).not.toHaveBeenCalled();

		// Re-query rather than reuse the pre-click element reference — a
		// controlled Base UI Switch re-renders its DOM node on state change.
		await waitFor(() => {
			expect(
				screen
					.getByTestId('assign-member-toggle-user-1')
					.getAttribute('aria-checked'),
			).toBe('true');
		});
		await waitFor(() => {
			expect(mocks.invalidateQueries).toHaveBeenCalled();
		});
	});

	test('toggling a row off fires exactly one unassign DELETE for that member', async () => {
		renderDrawer();

		// First toggle on, then off — mirrors a staff admin correcting a
		// just-made assignment within the same drawer session.
		fireEvent.click(screen.getByTestId('assign-member-toggle-user-1'));
		await waitFor(() => {
			expect(
				screen
					.getByTestId('assign-member-toggle-user-1')
					.getAttribute('aria-checked'),
			).toBe('true');
		});

		fireEvent.click(screen.getByTestId('assign-member-toggle-user-1'));
		await waitFor(() => {
			expect(mocks.unassignMutateAsync).toHaveBeenCalledTimes(1);
		});
		expect(mocks.unassignMutateAsync).toHaveBeenCalledWith({
			tenantId: 'tenant-1',
			profileId: 'profile-1',
			userAccountId: 'user-1',
		});
		await waitFor(() => {
			expect(
				screen
					.getByTestId('assign-member-toggle-user-1')
					.getAttribute('aria-checked'),
			).toBe('false');
		});
	});

	test('reverts the optimistic toggle when the assign mutation fails', async () => {
		mocks.assignMutateAsync.mockRejectedValueOnce(new Error('cap exceeded'));
		renderDrawer();

		fireEvent.click(screen.getByTestId('assign-member-toggle-user-1'));

		await waitFor(() => {
			expect(mocks.assignMutateAsync).toHaveBeenCalledTimes(1);
		});
		await waitFor(() => {
			expect(
				screen
					.getByTestId('assign-member-toggle-user-1')
					.getAttribute('aria-checked'),
			).toBe('false');
		});
		// A local, non-401 failure never triggers a session-expiry redirect.
		expect(mocks.shouldLogoutForFailure).toHaveBeenCalled();
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

	test('resolves assignment status for the currently loaded rows', () => {
		renderDrawer();

		const lastCall =
			mocks.useStaffTenantProfileMemberAssignmentResolutionQuery.mock.calls[
				mocks.useStaffTenantProfileMemberAssignmentResolutionQuery.mock.calls
					.length - 1
			];
		expect(lastCall?.[0]).toEqual({
			tenantId: 'tenant-1',
			profileId: 'profile-1',
			userAccountIds: ['user-1', 'user-2'],
		});
		expect(lastCall?.[1]?.enabled).toBe(true);
	});

	test('seeds a row as checked when the resolve-assignment read reports it already assigned', () => {
		mocks.useStaffTenantProfileMemberAssignmentResolutionQuery.mockReturnValue({
			data: {
				assignments: [
					{ userAccountId: 'user-1', isAssigned: true },
					{ userAccountId: 'user-2', isAssigned: false },
				],
			},
			isPending: false,
			isError: false,
		});

		renderDrawer();

		expect(
			screen
				.getByTestId('assign-member-toggle-user-1')
				.getAttribute('aria-checked'),
		).toBe('true');
		expect(
			screen
				.getByTestId('assign-member-toggle-user-2')
				.getAttribute('aria-checked'),
		).toBe('false');
	});

	test('toggling a resolved-as-assigned row off still fires the unassign DELETE', async () => {
		mocks.useStaffTenantProfileMemberAssignmentResolutionQuery.mockReturnValue({
			data: {
				assignments: [{ userAccountId: 'user-1', isAssigned: true }],
			},
			isPending: false,
			isError: false,
		});

		renderDrawer();

		expect(
			screen
				.getByTestId('assign-member-toggle-user-1')
				.getAttribute('aria-checked'),
		).toBe('true');

		fireEvent.click(screen.getByTestId('assign-member-toggle-user-1'));

		await waitFor(() => {
			expect(mocks.unassignMutateAsync).toHaveBeenCalledTimes(1);
		});
		expect(mocks.assignMutateAsync).not.toHaveBeenCalled();
	});
});
