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
	deleteStaffTenantProfileMutationOptions,
	buildFindStaffTenantProfilesQueryParameters,
	assignStaffTenantProfilePermissionMutationOptions,
	unassignStaffTenantProfilePermissionMutationOptions,
	buildUpdateStaffTenantProfileBody,
	toStaffTenantProfileDetails,
	toStaffTenantProfilePermissionKeys,
	toStaffTenantProfileRows,
} from '~/lib/query/staff-tenant-profiles';

import type {
	FindTenantProfilePermissionsAsStaffResult,
	GetTenantProfileByIdResponse,
	TenantProfileItem,
} from '@org/client-ts/src/models/index.js';

beforeEach(() => {
	vi.clearAllMocks();
});

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

		expect(body.name).toBeDefined();
		expect(body.description).toBeDefined();
		expect(body.permissionKeys).toBeUndefined();
	});

	test('omits blank description and permission keys when not provided', () => {
		const body = buildCreateStaffTenantProfileBody({
			name: 'Approvers',
			description: '   ',
		});

		expect(body.name).toBeDefined();
		expect(body.description).toBeUndefined();
		expect(body.permissionKeys).toBeUndefined();
	});
});

describe('buildUpdateStaffTenantProfileBody', () => {
	test('includes a trimmed description when provided', () => {
		const body = buildUpdateStaffTenantProfileBody({
			name: '  Approvers  ',
			description: '  Can review approvals  ',
		});

		expect(body.name).toBeDefined();
		expect(body.description).toBeDefined();
	});

	test('clears description with null when the value is blank', () => {
		const body = buildUpdateStaffTenantProfileBody({
			name: 'Approvers',
			description: '   ',
		});

		expect(body.name).toBeDefined();
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

describe('toStaffTenantProfileRows', () => {
	test('normalizes API items and skips rows without usable ids', () => {
		const items: TenantProfileItem[] = [
			{
				id: 'profile-1' as never,
				name: ' Approvers ',
				description: ' Can review approvals ',
				isDefault: true,
				userAccountCount: 7,
			},
			{
				id: '' as never,
				name: 'Skip me',
				description: 'Missing id',
				isDefault: false,
				userAccountCount: 1,
			},
			{
				id: 'profile-2' as never,
				name: null,
				description: ' ',
				isDefault: null,
				userAccountCount: null,
			},
		];

		expect(toStaffTenantProfileRows(items)).toEqual([
			{
				id: 'profile-1',
				name: 'Approvers',
				description: 'Can review approvals',
				isDefault: true,
				userAccountCount: 7,
			},
			{
				id: 'profile-2',
				name: '—',
				description: null,
				isDefault: false,
				userAccountCount: 0,
			},
		]);
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
