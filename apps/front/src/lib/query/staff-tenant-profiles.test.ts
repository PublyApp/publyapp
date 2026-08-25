import { QueryClient } from '@tanstack/react-query';
import { beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	getOrCreateStaffClient: vi.fn(),
}));

vi.mock('~/lib/api-client/client-manager', () => ({
	getClientManager: () => ({
		getOrCreateStaffClient: mocks.getOrCreateStaffClient,
	}),
	resolveApiBaseUrl: () => 'https://api.example.test',
}));
import {
	buildStaffTenantPermissionCatalogOptions,
	buildStaffTenantPermissionCatalogGroups,
	buildStaffTenantPermissionGroupColumns,
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
	getStaffTenantProfilePermissionKeysCacheSnapshot,
	getStaffTenantProfilePermissionKeysQueryKey,
	STAFF_TENANT_PROFILES_QUERY_KEY,
	staffTenantPermissionCatalogQueryOptions,
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
} from '@org/client-ts/models/index';

beforeEach(() => {
	vi.clearAllMocks();
});

/** A Kiota payload with its `getValue()` wrappers recursively stripped. */
type Unwrapped =
	| string
	| number
	| boolean
	| null
	| Unwrapped[]
	| { [key: string]: Unwrapped };

const unwrapUntyped = (value: unknown): Unwrapped => {
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

	// Exhaustive by construction: primitives pass through, wrappers/arrays/
	// objects recurse. The cast documents the invariant TS cannot infer.
	return value as Unwrapped;
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

describe('staffTenantPermissionCatalogQueryOptions', () => {
	test('scopes the request and cache key to the active language', async () => {
		const getCatalog = vi.fn().mockResolvedValue({ additionalData: {} });
		mocks.getOrCreateStaffClient.mockReturnValue({
			staff: {
				permissions: {
					scopes: {
						tenant: {
							get: getCatalog,
						},
					},
				},
			},
		});

		const englishKey = staffTenantPermissionCatalogQueryOptions.queryKey({
			language: 'en',
		});
		const frenchKey = staffTenantPermissionCatalogQueryOptions.queryKey({
			language: 'fr',
		});

		expect(englishKey).not.toEqual(frenchKey);
		expect(englishKey).toContainEqual({ language: 'en' });
		expect(frenchKey).toContainEqual({ language: 'fr' });

		await staffTenantPermissionCatalogQueryOptions.fetcher({
			language: 'fr',
		});

		expect(getCatalog).toHaveBeenCalledWith({
			queryParameters: { language: 'fr' },
		});
	});
});

describe('buildStaffTenantPermissionCatalogGroups', () => {
	test('assigns all 13 canonical modules to the design column flows', () => {
		const moduleKeys = [
			'posts',
			'media',
			'calendar',
			'channels',
			'approvals',
			'analytics',
			'members',
			'invitations',
			'profiles',
			'settings',
			'billing',
			'audit_logs',
			'modules',
		];
		const groups = moduleKeys.map((moduleKey) => ({
			moduleKey,
			moduleLabel: moduleKey,
			options: [],
		}));

		const [leftGroups, rightGroups] =
			buildStaffTenantPermissionGroupColumns(groups);

		expect(leftGroups.map((group) => group.moduleKey)).toEqual([
			'posts',
			'media',
			'calendar',
			'invitations',
			'audit_logs',
			'modules',
		]);
		expect(rightGroups.map((group) => group.moduleKey)).toEqual([
			'channels',
			'approvals',
			'analytics',
			'members',
			'settings',
			'billing',
			'profiles',
		]);
	});

	test('appends future modules in catalog order to the shorter column', () => {
		const groups = ['posts', 'channels', 'future_a', 'future_b'].map(
			(moduleKey) => ({
				moduleKey,
				moduleLabel: moduleKey,
				options: [],
			}),
		);

		const [leftGroups, rightGroups] =
			buildStaffTenantPermissionGroupColumns(groups);

		expect(leftGroups.map((group) => group.moduleKey)).toEqual([
			'posts',
			'future_a',
		]);
		expect(rightGroups.map((group) => group.moduleKey)).toEqual([
			'channels',
			'future_b',
		]);
	});

	test('orders every known module in the canonical matrix sequence', () => {
		const shuffledModuleKeys = [
			'modules',
			'billing',
			'profiles',
			'members',
			'analytics',
			'approvals',
			'channels',
			'calendar',
			'media',
			'posts',
			'audit_logs',
			'settings',
			'invitations',
		];
		const catalog = Object.fromEntries(
			shuffledModuleKeys.map((moduleKey) => [
				moduleKey,
				{
					permission: {
						key: `tenant.${moduleKey}.future_action`,
						name: moduleKey,
					},
				},
			]),
		);

		expect(
			buildStaffTenantPermissionCatalogGroups(catalog).map(
				(group) => group.moduleKey,
			),
		).toEqual([
			'posts',
			'media',
			'calendar',
			'channels',
			'approvals',
			'analytics',
			'members',
			'invitations',
			'profiles',
			'settings',
			'billing',
			'audit_logs',
			'modules',
		]);
	});

	test('uses canonical module and action order independently of translated labels', () => {
		const groups = buildStaffTenantPermissionCatalogGroups({
			modules: {
				users: { key: 'tenant.modules.access_users', name: 'A' },
				dashboard: { key: 'tenant.modules.access_dashboard', name: 'Z' },
			},
			members: {
				remove: { key: 'tenant.members.remove', name: 'A' },
				view: { key: 'tenant.members.view', name: 'Z' },
				manage: { key: 'tenant.members.manage', name: 'M' },
			},
			analytics: {
				export: { key: 'tenant.analytics.export', name: 'A' },
				view: { key: 'tenant.analytics.view', name: 'Z' },
			},
			channels: {
				disconnect: { key: 'tenant.channels.disconnect', name: 'A' },
				manage: { key: 'tenant.channels.manage', name: 'Z' },
				connect: { key: 'tenant.channels.connect', name: 'M' },
				view: { key: 'tenant.channels.view', name: 'Y' },
			},
			posts: {
				delete: { key: 'tenant.posts.delete', name: 'A' },
				archive: { key: 'tenant.posts.archive', name: 'B' },
				view: { key: 'tenant.posts.view', name: 'Z' },
				create: { key: 'tenant.posts.create', name: 'Y' },
				duplicate: { key: 'tenant.posts.duplicate', name: 'C' },
			},
			zeta: {
				view: { key: 'tenant.zeta.view', name: 'A' },
			},
		});

		expect(groups.map((group) => group.moduleKey)).toEqual([
			'posts',
			'channels',
			'analytics',
			'members',
			'modules',
			'zeta',
		]);
		expect(groups[0]?.options.map((option) => option.key)).toEqual([
			'tenant.posts.view',
			'tenant.posts.create',
			'tenant.posts.delete',
			'tenant.posts.archive',
			'tenant.posts.duplicate',
		]);
		expect(groups[1]?.options.map((option) => option.key)).toEqual([
			'tenant.channels.view',
			'tenant.channels.connect',
			'tenant.channels.manage',
			'tenant.channels.disconnect',
		]);
		expect(groups[2]?.options.map((option) => option.key)).toEqual([
			'tenant.analytics.view',
			'tenant.analytics.export',
		]);
		expect(groups[3]?.options.map((option) => option.key)).toEqual([
			'tenant.members.view',
			'tenant.members.manage',
			'tenant.members.remove',
		]);
		expect(groups[4]?.options.map((option) => option.key)).toEqual([
			'tenant.modules.access_dashboard',
			'tenant.modules.access_users',
		]);
	});
});

describe('staff tenant profile permission-key cache snapshot', () => {
	test('reads normalized data and revision from the exact scoped query entry', () => {
		const queryClient = new QueryClient();
		const variables = { tenantId: 'tenant-1', profileId: 'profile-1' };
		const queryKey = getStaffTenantProfilePermissionKeysQueryKey(variables);
		queryClient.setQueryData(
			queryKey,
			{ permissionKeys: [' channels.view ', 'posts.view', 'posts.view'] },
			{ updatedAt: 42 },
		);

		expect(
			getStaffTenantProfilePermissionKeysCacheSnapshot(queryClient, variables),
		).toEqual({
			permissionKeys: ['channels.view', 'posts.view'],
			revision: 1,
		});
	});

	test('advances the revision when data updates within the same millisecond', () => {
		const queryClient = new QueryClient();
		const variables = { tenantId: 'tenant-1', profileId: 'profile-1' };
		const queryKey = getStaffTenantProfilePermissionKeysQueryKey(variables);
		queryClient.setQueryData(
			queryKey,
			{ permissionKeys: ['posts.view'] },
			{ updatedAt: 42 },
		);
		queryClient.setQueryData(
			queryKey,
			{ permissionKeys: ['channels.view'] },
			{ updatedAt: 42 },
		);

		expect(queryClient.getQueryState(queryKey)?.dataUpdatedAt).toBe(42);
		expect(
			getStaffTenantProfilePermissionKeysCacheSnapshot(queryClient, variables),
		).toEqual({
			permissionKeys: ['channels.view'],
			revision: 2,
		});
	});
});

describe('buildCreateStaffTenantProfileBody', () => {
	test('serializes the concrete icon and tone', () => {
		const body = buildCreateStaffTenantProfileBody({
			name: 'Approvers',
			icon: 'briefcase',
			tone: '6',
		});

		expect(unwrapUntyped(body.icon)).toBe('briefcase');
		expect(unwrapUntyped(body.tone)).toBe('6');
	});

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
	test('serializes the concrete icon and tone', () => {
		const body = buildUpdateStaffTenantProfileBody({
			name: 'Approvers',
			icon: 'briefcase',
			tone: '6',
		});

		expect(unwrapUntyped(body.icon)).toBe('briefcase');
		expect(unwrapUntyped(body.tone)).toBe('6');
	});

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

	// #1406 — the edit drawer clears the textarea to the exact value `''`
	// (Zod trims before the body builder sees it), so pin the zero-length
	// string itself, not only its whitespace cousins.
	test('clears description with null when the drawer submits an empty string', () => {
		const body = buildUpdateStaffTenantProfileBody({
			name: 'Approvers',
			description: '',
		});

		expect(unwrapUntyped(body.name)).toBe('Approvers');
		expect(body.description).toBeNull();
	});

	test('serializes null icon and tone to restore automatic styling', () => {
		const body = buildUpdateStaffTenantProfileBody({
			name: 'Approvers',
			icon: null,
			tone: null,
		});

		expect(body.icon).toBeNull();
		expect(body.tone).toBeNull();
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
				id: 'profile-1',
				name: ' Approvers ',
				description: ' Can review approvals ',
				icon: ' briefcase ',
				tone: ' 6 ',
				isDefault: true,
				userAccountCount: 7,
				permissionsCount: 12,
			},
			{
				id: '',
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
				icon: 'briefcase',
				tone: '6',
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
				id: 'profile-2',
				name: null,
				description: ' ',
				isDefault: null,
				userAccountCount: null,
				permissionsCount: null,
			},
			{
				id: 'profile-3',
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
		const createdAt = new Date('2026-05-10T09:00:00Z');
		const updatedAt = new Date('2026-07-14T10:00:00Z');

		expect(
			toStaffTenantProfileDetails({
				profile: {
					id: 'profile-7',
					name: ' Approvers ',
					description: ' Can review approvals ',
					icon: ' briefcase ',
					tone: ' 6 ',
					isDefault: true,
					userAccountCount: 7,
					createdAt,
					updatedAt,
				},
			} as GetTenantProfileByIdResponse),
		).toEqual({
			id: 'profile-7',
			name: 'Approvers',
			description: 'Can review approvals',
			icon: 'briefcase',
			tone: '6',
			isDefault: true,
			userAccountCount: 7,
			createdAt,
			updatedAt,
		});
	});

	test('nulls out missing or invalid timestamps', () => {
		const result = toStaffTenantProfileDetails({
			profile: {
				id: 'profile-9',
				name: 'Approvers',
				createdAt: new Date('invalid'),
			},
		} as GetTenantProfileByIdResponse);

		expect(result?.createdAt).toBeNull();
		expect(result?.updatedAt).toBeNull();
	});

	test('returns null when the payload has no usable profile id', () => {
		expect(
			toStaffTenantProfileDetails({
				profile: {
					id: ' ',
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
					id: 'profile-8',
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

		void invalidateStaffTenantProfiles({ invalidateQueries } satisfies Pick<
			QueryClient,
			'invalidateQueries'
		>);

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
				id: 'user-account-1',
				userId: 'user-1',
				email: ' ada@example.com ',
				firstName: ' Ada ',
				lastName: ' Lovelace ',
				avatarUrl: '/files/uploads/ada.png',
				status: 'Active',
				level: 'Admin',
				otherProfiles: [
					{
						id: 'profile-1',
						name: ' Editors ',
					},
				],
				joinedAt: new Date('2026-02-03T04:05:06Z'),
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
				otherProfiles: null,
				joinedAt: null,
			},
			{
				id: '',
				userId: 'user-skip',
				email: 'skip-me@example.com',
				firstName: 'Skip',
				lastName: 'Me',
				avatarUrl: null,
				status: 'Active',
				level: 'User',
				otherProfiles: [],
				joinedAt: null,
			},
			{
				id: 'user-account-4',
				userId: 'user-4',
				email: '  ',
				firstName: 'No',
				lastName: 'Email',
				avatarUrl: null,
				status: 'Active',
				level: 'User',
				otherProfiles: [],
				joinedAt: null,
			},
			{
				id: 'user-account-5',
				userId: '',
				email: 'no-user-id@example.com',
				firstName: 'No',
				lastName: 'UserId',
				avatarUrl: null,
				status: 'Active',
				level: 'User',
				otherProfiles: [],
				joinedAt: null,
			},
		];

		expect(toStaffTenantProfileMemberRows(items)).toEqual([
			{
				id: 'user-account-1',
				userId: 'user-1',
				email: 'ada@example.com',
				firstName: 'Ada',
				lastName: 'Lovelace',
				avatarUrl: 'https://api.example.test/files/uploads/ada.png',
				status: 'Active',
				level: 'Admin',
				otherProfiles: [{ id: 'profile-1', name: 'Editors' }],
				joinedAt: new Date('2026-02-03T04:05:06Z'),
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
				otherProfiles: [],
				joinedAt: null,
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
				id: 'user-account-9',
				userId: 'user-9',
				email: 'rae@example.com',
				firstName: 'Rae',
				lastName: 'Lee',
				avatarUrl: null,
				status: 'Active',
				level: 'User',
				otherProfiles: [],
				joinedAt: null,
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
				{ userAccountId: 'user-account-1', isAssigned: true },
				{ userAccountId: 'user-account-2', isAssigned: false },
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
				{ userAccountId: '', isAssigned: true },
				{ userAccountId: null, isAssigned: true },
			],
		};

		expect(toStaffTenantProfileMemberAssignmentMap(result)).toEqual({});
	});

	test('returns an empty map when the payload is empty', () => {
		expect(toStaffTenantProfileMemberAssignmentMap(undefined)).toEqual({});
	});
});
