import { beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	getOrCreateStaffClient: vi.fn(),
}));

vi.mock('~/lib/api-client/client-manager', () => ({
	getClientManager: () => ({
		getOrCreateStaffClient: mocks.getOrCreateStaffClient,
	}),
}));
import {
	buildStaffTenantPermissionCatalogOptions,
	buildCreateStaffTenantProfileBody,
	buildFindStaffTenantProfileMembersQueryParameters,
	buildResolveStaffTenantProfileMemberAssignmentsBody,
	deleteStaffTenantProfileMutationOptions,
	buildFindStaffTenantProfilesQueryParameters,
	assignStaffTenantProfilePermissionMutationOptions,
	unassignStaffTenantProfilePermissionMutationOptions,
	assignStaffTenantProfileUserMutationOptions,
	unassignStaffTenantProfileUserMutationOptions,
	buildUpdateStaffTenantProfileBody,
	invalidateStaffTenantProfiles,
	STAFF_TENANT_PROFILES_QUERY_KEY,
	toStaffTenantProfileDetails,
	toStaffTenantProfileMemberAssignmentMap,
	toStaffTenantProfileMemberRows,
	toStaffTenantProfilePermissionKeys,
	toStaffTenantProfileRows,
} from '~/lib/query/staff-tenant-profiles';

import type {
	FindTenantProfilePermissionsAsStaffResult,
	GetTenantProfileByIdResponse,
	ResolveTenantProfileUserAssignmentsAsStaffResult,
	TenantProfileItem,
	TenantProfileUserItem,
} from '@org/client-ts/src/models/index.js';

beforeEach(() => {
	vi.clearAllMocks();
});

const unwrapUntyped = (value: unknown): unknown => {
	if (
		typeof value === 'object' &&
		value !== null &&
		'getValue' in value &&
		typeof (value as { getValue?: unknown }).getValue === 'function'
	) {
		return unwrapUntyped((value as { value?: unknown }).value);
	}

	if (Array.isArray(value)) {
		return value.map((item) => unwrapUntyped(item));
	}

	if (value && typeof value === 'object') {
		return Object.fromEntries(
			Object.entries(value as Record<string, unknown>).map(([key, nested]) => [
				key,
				unwrapUntyped(nested),
			]),
		);
	}

	return value;
};

describe('buildFindStaffTenantProfilesQueryParameters', () => {
	test('trims supported values and stringifies page size', () => {
		expect(
			buildFindStaffTenantProfilesQueryParameters({
				q: ' approver ',
				sortId: ' name ',
				sortOrder: 'asc',
				cursor: ' profile-123 ',
				size: 50,
			}),
		).toEqual({
			q: 'approver',
			sortId: 'name',
			sortOrder: 'asc',
			cursor: 'profile-123',
			limit: '50',
		});
	});

	test('omits blank or invalid values', () => {
		expect(
			buildFindStaffTenantProfilesQueryParameters({
				q: '   ',
				sortId: '',
				sortOrder: undefined,
				cursor: ' ',
				size: 0,
			}),
		).toEqual({});
	});
});

describe('buildStaffTenantPermissionCatalogOptions', () => {
	test('flattens permissions and emits stable labels', () => {
		const options = buildStaffTenantPermissionCatalogOptions({
			tenant: {
				'tenant.users.read': {
					key: 'tenant.users.read',
					name: 'Read users',
					description: 'Read users permission',
				},
				'tenant.users.write': {
					key: 'tenant.users.write',
					name: 'Write users',
					description: 'Write users permission',
				},
			},
			reports: {
				'reports.view': {
					key: 'reports.view',
					name: 'View reports',
				},
			},
		});

		expect(options).toEqual([
			{
				key: 'reports.view',
				label: 'Reports • View reports',
				description: null,
			},
			{
				key: 'tenant.users.read',
				label: 'Tenant • Read users',
				description: 'Read users permission',
			},
			{
				key: 'tenant.users.write',
				label: 'Tenant • Write users',
				description: 'Write users permission',
			},
		]);
	});

	test('ignores malformed catalog values', () => {
		expect(
			buildStaffTenantPermissionCatalogOptions({
				tenant: {
					invalid: {},
					valid: {
						key: 'tenant.valid',
					},
				},
			}),
		).toEqual([
			{
				key: 'tenant.valid',
				label: 'tenant.valid',
				description: null,
			},
		]);
	});
});

describe('buildCreateStaffTenantProfileBody', () => {
	test('includes a trimmed description without serializing permission keys', () => {
		const body = buildCreateStaffTenantProfileBody({
			name: 'Approvers',
			description: '  Can review approvals  ',
		});

		expect(unwrapUntyped(body.name)).toBe('Approvers');
		expect(unwrapUntyped(body.description)).toBe('Can review approvals');
		expect(body.permissionKeys).toBeUndefined();
	});

	test('omits blank description and permission keys when not provided', () => {
		const body = buildCreateStaffTenantProfileBody({
			name: 'Approvers',
			description: '   ',
		});

		expect(unwrapUntyped(body.name)).toBe('Approvers');
		expect(body.description).toBeUndefined();
		expect(body.permissionKeys).toBeUndefined();
	});

	test('serializes populated permission keys as an untyped string array', () => {
		const body = buildCreateStaffTenantProfileBody({
			name: 'Approvers',
			permissionKeys: ['tenant.users.manage', 'tenant.users.read'],
		});

		expect(unwrapUntyped(body.permissionKeys)).toEqual([
			'tenant.users.manage',
			'tenant.users.read',
		]);
	});

	// buildUpdateStaffTenantProfileBody trims `name` (below); create does not — pinning the
	// current asymmetry rather than silently normalizing it away in the test.
	test('does not trim the name (current asymmetry with the update body builder)', () => {
		const body = buildCreateStaffTenantProfileBody({
			name: '  Approvers  ',
		});

		expect(unwrapUntyped(body.name)).toBe('  Approvers  ');
	});
});

describe('buildUpdateStaffTenantProfileBody', () => {
	test('includes a trimmed description when provided', () => {
		const body = buildUpdateStaffTenantProfileBody({
			name: '  Approvers  ',
			description: '  Can review approvals  ',
		});

		expect(unwrapUntyped(body.name)).toBe('Approvers');
		expect(unwrapUntyped(body.description)).toBe('Can review approvals');
	});

	test('clears description with null when the value is blank', () => {
		const body = buildUpdateStaffTenantProfileBody({
			name: 'Approvers',
			description: '   ',
		});

		expect(unwrapUntyped(body.name)).toBe('Approvers');
		expect(body.description).toBeNull();
	});
});

describe('deleteStaffTenantProfileMutationOptions', () => {
	test('uses the generated tenant profile delete client path', async () => {
		const deleteProfile = vi.fn().mockResolvedValue({
			key: 'tenant-profile-deleted-success',
			message: 'Tenant profile deleted successfully',
		});
		const byProfileId = vi.fn((profileId: string) => ({
			delete: deleteProfile,
			profileId,
		}));
		const byTenantId = vi.fn((tenantId: string) => ({
			profiles: {
				byProfileId,
			},
			tenantId,
		}));

		mocks.getOrCreateStaffClient.mockReturnValue({
			staff: {
				tenants: {
					byTenantId,
				},
			},
		});

		const result = await deleteStaffTenantProfileMutationOptions.mutationFn({
			tenantId: 'tenant-123',
			profileId: 'profile-456',
		});

		expect(deleteStaffTenantProfileMutationOptions.mutationKey).toEqual([
			'staff',
			'staff-tenants',
			'profiles',
			'delete',
		]);
		expect(byTenantId).toHaveBeenCalledWith('tenant-123');
		expect(byProfileId).toHaveBeenCalledWith('profile-456');
		expect(deleteProfile).toHaveBeenCalledTimes(1);
		expect(result).toEqual({
			key: 'tenant-profile-deleted-success',
			message: 'Tenant profile deleted successfully',
		});
	});
});

describe('assignStaffTenantProfilePermissionMutationOptions', () => {
	test('calls tenant profile permission assignment path', async () => {
		const post = vi.fn().mockResolvedValue(undefined);
		const byPermissionKey = vi.fn((permissionKey: string) => ({
			post,
			permissionKey,
		}));
		const permissions = vi.fn(() => ({ byPermissionKey }));
		const byProfileId = vi.fn(() => ({
			permissions: permissions(),
		}));
		const byTenantId = vi.fn((tenantId: string) => ({
			profiles: {
				byProfileId,
			},
			tenantId,
		}));

		mocks.getOrCreateStaffClient.mockReturnValue({
			staff: {
				tenants: {
					byTenantId,
				},
			},
		});

		const result =
			await assignStaffTenantProfilePermissionMutationOptions.mutationFn({
				tenantId: 'tenant-123',
				profileId: 'profile-456',
				permissionKey: 'tenant.users.read',
			});

		expect(
			assignStaffTenantProfilePermissionMutationOptions.mutationKey,
		).toEqual([
			'staff',
			'staff',
			'staff-tenants',
			'profiles',
			'permissions',
			'assign',
		]);
		expect(byTenantId).toHaveBeenCalledWith('tenant-123');
		expect(byProfileId).toHaveBeenCalledWith('profile-456');
		expect(byPermissionKey).toHaveBeenCalledWith('tenant.users.read');
		expect(post).toHaveBeenCalledTimes(1);
		expect(result).toBeUndefined();
	});
});

describe('unassignStaffTenantProfilePermissionMutationOptions', () => {
	test('calls tenant profile permission unassignment path', async () => {
		const deletePermission = vi.fn().mockResolvedValue(undefined);
		const byPermissionKey = vi.fn((permissionKey: string) => ({
			delete: deletePermission,
			permissionKey,
		}));
		const permissions = vi.fn(() => ({ byPermissionKey }));
		const byProfileId = vi.fn(() => ({
			permissions: permissions(),
		}));
		const byTenantId = vi.fn((tenantId: string) => ({
			profiles: {
				byProfileId,
			},
			tenantId,
		}));

		mocks.getOrCreateStaffClient.mockReturnValue({
			staff: {
				tenants: {
					byTenantId,
				},
			},
		});

		const result =
			await unassignStaffTenantProfilePermissionMutationOptions.mutationFn({
				tenantId: 'tenant-123',
				profileId: 'profile-456',
				permissionKey: 'tenant.users.read',
			});

		expect(
			unassignStaffTenantProfilePermissionMutationOptions.mutationKey,
		).toEqual([
			'staff',
			'staff',
			'staff-tenants',
			'profiles',
			'permissions',
			'unassign',
		]);
		expect(byTenantId).toHaveBeenCalledWith('tenant-123');
		expect(byProfileId).toHaveBeenCalledWith('profile-456');
		expect(byPermissionKey).toHaveBeenCalledWith('tenant.users.read');
		expect(deletePermission).toHaveBeenCalledTimes(1);
		expect(result).toBeUndefined();
	});
});

describe('assignStaffTenantProfileUserMutationOptions', () => {
	test('calls the per-member tenant profile assignment (toggle) path', async () => {
		const post = vi.fn().mockResolvedValue(undefined);
		const byUser_account_id = vi.fn((userAccountId: string) => ({
			post,
			userAccountId,
		}));
		const users = vi.fn(() => ({ byUser_account_id }));
		const byProfileId = vi.fn(() => ({
			users: users(),
		}));
		const byTenantId = vi.fn((tenantId: string) => ({
			profiles: {
				byProfileId,
			},
			tenantId,
		}));

		mocks.getOrCreateStaffClient.mockReturnValue({
			staff: {
				tenants: {
					byTenantId,
				},
			},
		});

		const result = await assignStaffTenantProfileUserMutationOptions.mutationFn(
			{
				tenantId: 'tenant-123',
				profileId: 'profile-456',
				userAccountId: 'user-account-789',
			},
		);

		expect(assignStaffTenantProfileUserMutationOptions.mutationKey).toEqual([
			'staff',
			'staff-tenants',
			'profiles',
			'users',
			'assign',
		]);
		expect(byTenantId).toHaveBeenCalledWith('tenant-123');
		expect(byProfileId).toHaveBeenCalledWith('profile-456');
		expect(byUser_account_id).toHaveBeenCalledWith('user-account-789');
		expect(post).toHaveBeenCalledTimes(1);
		expect(result).toBeUndefined();
	});
});

describe('unassignStaffTenantProfileUserMutationOptions', () => {
	test('calls the per-member tenant profile unassignment (toggle) path', async () => {
		const deleteMember = vi.fn().mockResolvedValue(undefined);
		const byUser_account_id = vi.fn((userAccountId: string) => ({
			delete: deleteMember,
			userAccountId,
		}));
		const users = vi.fn(() => ({ byUser_account_id }));
		const byProfileId = vi.fn(() => ({
			users: users(),
		}));
		const byTenantId = vi.fn((tenantId: string) => ({
			profiles: {
				byProfileId,
			},
			tenantId,
		}));

		mocks.getOrCreateStaffClient.mockReturnValue({
			staff: {
				tenants: {
					byTenantId,
				},
			},
		});

		const result =
			await unassignStaffTenantProfileUserMutationOptions.mutationFn({
				tenantId: 'tenant-123',
				profileId: 'profile-456',
				userAccountId: 'user-account-789',
			});

		expect(unassignStaffTenantProfileUserMutationOptions.mutationKey).toEqual([
			'staff',
			'staff-tenants',
			'profiles',
			'users',
			'unassign',
		]);
		expect(byTenantId).toHaveBeenCalledWith('tenant-123');
		expect(byProfileId).toHaveBeenCalledWith('profile-456');
		expect(byUser_account_id).toHaveBeenCalledWith('user-account-789');
		expect(deleteMember).toHaveBeenCalledTimes(1);
		expect(result).toBeUndefined();
	});
});

describe('toStaffTenantProfileRows', () => {
	test('normalizes API items and skips rows without usable ids', () => {
		const items: TenantProfileItem[] = [
			{
				id: 'profile-1' as never,
				name: ' Approvers ',
				description: ' Can review approvals ',
				isDefault: true,
				userAccountCount: 7,
				permissionsCount: 12,
			},
			{
				id: '' as never,
				name: 'Skip me',
				description: 'Missing id',
				isDefault: false,
				userAccountCount: 1,
				permissionsCount: 1,
			},
		];

		expect(toStaffTenantProfileRows(items)).toEqual([
			{
				id: 'profile-1',
				name: 'Approvers',
				description: 'Can review approvals',
				isDefault: true,
				userAccountCount: 7,
				permissionsCount: 12,
			},
		]);
	});

	// shell-r5-F3: a row missing its required `name` used to be kept with a
	// `'—'` placeholder a staff admin can't distinguish from real data. It
	// must be dropped instead.
	test('drops a row with a blank/missing name rather than fabricating a placeholder', () => {
		const items: TenantProfileItem[] = [
			{
				id: 'profile-2' as never,
				name: null,
				description: ' ',
				isDefault: null,
				userAccountCount: null,
				permissionsCount: null,
			},
			{
				id: 'profile-3' as never,
				name: '   ',
				description: null,
				isDefault: false,
				userAccountCount: 0,
				permissionsCount: 0,
			},
		];

		expect(toStaffTenantProfileRows(items)).toEqual([]);
	});
});

describe('toStaffTenantProfileDetails', () => {
	test('normalizes a detail payload and preserves optional values', () => {
		expect(
			toStaffTenantProfileDetails({
				profile: {
					id: 'profile-7' as never,
					name: ' Approvers ',
					description: ' Can review approvals ',
					isDefault: true,
					userAccountCount: 7,
				},
			} as GetTenantProfileByIdResponse),
		).toEqual({
			id: 'profile-7',
			name: 'Approvers',
			description: 'Can review approvals',
			isDefault: true,
			userAccountCount: 7,
		});
	});

	test('returns null when the payload has no usable profile id', () => {
		expect(
			toStaffTenantProfileDetails({
				profile: {
					id: ' ' as never,
					name: 'Approvers',
				},
			} as GetTenantProfileByIdResponse),
		).toBeNull();
	});

	// shell-r5-F3: a payload missing its required `name` used to be treated
	// as present-but-blank, fabricating a `'—'` placeholder. It must be
	// treated the same as "not found" instead.
	test('returns null when the payload has no usable name', () => {
		expect(
			toStaffTenantProfileDetails({
				profile: {
					id: 'profile-8' as never,
					name: '   ',
				},
			} as GetTenantProfileByIdResponse),
		).toBeNull();
	});
});

describe('toStaffTenantProfilePermissionKeys', () => {
	test('normalizes keys, removes blanks, de-duplicates, and keeps sorted order', () => {
		expect(
			toStaffTenantProfilePermissionKeys({
				permissionKeys: [
					' tenant.users.manage ',
					'',
					'tenant.billing.view',
					'tenant.users.manage',
					null,
				],
			} as FindTenantProfilePermissionsAsStaffResult),
		).toEqual(['tenant.billing.view', 'tenant.users.manage']);
	});

	test('returns an empty list when the payload is empty', () => {
		expect(toStaffTenantProfilePermissionKeys(undefined)).toEqual([]);
	});
});

describe('buildUpdateStaffTenantProfileBody description branch', () => {
	test('omits description entirely when it was not provided', () => {
		const body = buildUpdateStaffTenantProfileBody({ name: 'Approvers' });

		expect('description' in body).toBe(false);
	});
});

describe('invalidateStaffTenantProfiles', () => {
	test('invalidates the shared staff-tenant-profiles scope prefix', () => {
		const invalidateQueries = vi.fn();

		void invalidateStaffTenantProfiles({ invalidateQueries } as never);

		expect(invalidateQueries).toHaveBeenCalledWith({
			queryKey: ['staff', ...STAFF_TENANT_PROFILES_QUERY_KEY],
		});
	});
});

describe('buildFindStaffTenantProfileMembersQueryParameters', () => {
	test('trims supported values, 1-indexes the page, and stringifies the limit', () => {
		expect(
			buildFindStaffTenantProfileMembersQueryParameters({
				q: ' approver ',
				sortId: ' email ',
				sortOrder: 'asc',
				pageIndex: 2,
				size: 20,
			}),
		).toEqual({
			q: 'approver',
			sortId: 'email',
			sortOrder: 'asc',
			page: '3',
			limit: '20',
		});
	});

	test('defaults to page 1 and omits blank/invalid values', () => {
		expect(
			buildFindStaffTenantProfileMembersQueryParameters({
				q: '   ',
				sortId: '',
				sortOrder: undefined,
				pageIndex: undefined,
				size: 0,
			}),
		).toEqual({
			page: '1',
			q: undefined,
			sortId: undefined,
			sortOrder: undefined,
			limit: undefined,
		});
	});

	test('clamps a negative or non-integer page index back to page 1', () => {
		expect(
			buildFindStaffTenantProfileMembersQueryParameters({ pageIndex: -3 }),
		).toEqual({
			page: '1',
			q: undefined,
			sortId: undefined,
			sortOrder: undefined,
			limit: undefined,
		});
	});
});

describe('toStaffTenantProfileMemberRows', () => {
	test('normalizes API items, prefers the full name, and skips rows without a usable id, userId, or email', () => {
		const items: TenantProfileUserItem[] = [
			{
				id: 'user-account-1' as never,
				userId: 'user-1' as never,
				email: ' ada@example.com ',
				firstName: ' Ada ',
				lastName: ' Lovelace ',
				avatarUrl: null,
				status: 'Active',
				level: 'Admin',
			},
			{
				id: 'user-account-2' as never,
				userId: 'user-2' as never,
				email: 'grace@example.com',
				firstName: null,
				lastName: null,
				avatarUrl: null,
				status: 'Suspended',
				level: 'User',
			},
			{
				id: '' as never,
				userId: 'user-skip' as never,
				email: 'skip-me@example.com',
				firstName: 'Skip',
				lastName: 'Me',
				avatarUrl: null,
				status: 'Active',
				level: 'User',
			},
			{
				id: 'user-account-4' as never,
				userId: 'user-4' as never,
				email: '  ',
				firstName: 'No',
				lastName: 'Email',
				avatarUrl: null,
				status: 'Active',
				level: 'User',
			},
			{
				id: 'user-account-5' as never,
				userId: '' as never,
				email: 'no-user-id@example.com',
				firstName: 'No',
				lastName: 'UserId',
				avatarUrl: null,
				status: 'Active',
				level: 'User',
			},
		];

		expect(toStaffTenantProfileMemberRows(items)).toEqual([
			{
				id: 'user-account-1',
				userId: 'user-1',
				email: 'ada@example.com',
				firstName: 'Ada',
				lastName: 'Lovelace',
				avatarUrl: null,
				status: 'Active',
				level: 'Admin',
				displayName: 'Ada Lovelace',
			},
			{
				id: 'user-account-2',
				userId: 'user-2',
				email: 'grace@example.com',
				firstName: null,
				lastName: null,
				avatarUrl: null,
				status: 'Suspended',
				level: 'User',
				displayName: 'grace@example.com',
			},
		]);
	});

	// step4b-review MAJOR 4: `id` (the tenant membership/user_account_id) and
	// `userId` (the global user id, needed to link to the member's own detail
	// page) are independent UUIDs — a row must carry both, distinctly.
	test('keeps id (user_account_id) and userId (global user id) as distinct fields', () => {
		const [row] = toStaffTenantProfileMemberRows([
			{
				id: 'user-account-9' as never,
				userId: 'user-9' as never,
				email: 'rae@example.com',
				firstName: 'Rae',
				lastName: 'Lee',
				avatarUrl: null,
				status: 'Active',
				level: 'User',
			},
		]);

		expect(row?.id).toBe('user-account-9');
		expect(row?.userId).toBe('user-9');
		expect(row?.userId).not.toBe(row?.id);
	});

	test('returns an empty list when the payload is empty', () => {
		expect(toStaffTenantProfileMemberRows(undefined)).toEqual([]);
		expect(toStaffTenantProfileMemberRows(null)).toEqual([]);
	});
});

describe('buildResolveStaffTenantProfileMemberAssignmentsBody', () => {
	test('serializes the user account ids as an untyped string array', () => {
		const body = buildResolveStaffTenantProfileMemberAssignmentsBody([
			'user-account-1',
			'user-account-2',
		]);

		expect(unwrapUntyped(body.userAccountIds)).toEqual([
			'user-account-1',
			'user-account-2',
		]);
	});

	test('serializes an empty id list as an empty array', () => {
		const body = buildResolveStaffTenantProfileMemberAssignmentsBody([]);

		expect(unwrapUntyped(body.userAccountIds)).toEqual([]);
	});
});

describe('toStaffTenantProfileMemberAssignmentMap', () => {
	test('maps each user account id to its assigned boolean', () => {
		const result: ResolveTenantProfileUserAssignmentsAsStaffResult = {
			assignments: [
				{ userAccountId: 'user-account-1' as never, isAssigned: true },
				{ userAccountId: 'user-account-2' as never, isAssigned: false },
			],
		};

		expect(toStaffTenantProfileMemberAssignmentMap(result)).toEqual({
			'user-account-1': true,
			'user-account-2': false,
		});
	});

	test('skips assignments without a usable user account id', () => {
		const result: ResolveTenantProfileUserAssignmentsAsStaffResult = {
			assignments: [
				{ userAccountId: '' as never, isAssigned: true },
				{ userAccountId: null, isAssigned: true },
			],
		};

		expect(toStaffTenantProfileMemberAssignmentMap(result)).toEqual({});
	});

	test('returns an empty map when the payload is empty', () => {
		expect(toStaffTenantProfileMemberAssignmentMap(undefined)).toEqual({});
	});
});
