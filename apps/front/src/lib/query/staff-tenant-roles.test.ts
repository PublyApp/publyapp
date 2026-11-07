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
	buildCreateStaffTenantRoleBody,
	buildFindStaffTenantRoleMembersQueryParameters,
	buildResolveStaffTenantRoleMemberAssignmentsBody,
	deleteStaffTenantRoleMutationOptions,
	buildFindStaffTenantRolesQueryParameters,
	assignStaffTenantRolePermissionMutationOptions,
	unassignStaffTenantRolePermissionMutationOptions,
	assignStaffTenantRoleUserMutationOptions,
	unassignStaffTenantRoleUserMutationOptions,
	buildUpdateStaffTenantRoleBody,
	invalidateStaffTenantRoles,
	getStaffTenantRolePermissionKeysCacheSnapshot,
	getStaffTenantRolePermissionKeysQueryKey,
	STAFF_TENANT_ROLES_QUERY_KEY,
	staffTenantPermissionCatalogQueryOptions,
	toStaffTenantRoleDetails,
	toStaffTenantRoleMemberAssignmentMap,
	toStaffTenantRoleMemberRows,
	toStaffTenantRolePermissionKeys,
	toStaffTenantRoleRows,
} from '~/lib/query/staff-tenant-roles';

import type {
	FindTenantRolePermissionsAsStaffResult,
	GetTenantRoleByIdResponse,
	ResolveTenantRoleUserAssignmentsAsStaffResult,
	TenantRoleItem,
	TenantRoleUserItem,
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

describe('buildFindStaffTenantRolesQueryParameters', () => {
	test('trims supported values and stringifies page size', () => {
		expect(
			buildFindStaffTenantRolesQueryParameters({
				q: ' approver ',
				sortId: ' name ',
				sortOrder: 'asc',
				cursor: ' role-123 ',
				size: 50,
			}),
		).toEqual({
			q: 'approver',
			sortId: 'name',
			sortOrder: 'asc',
			cursor: 'role-123',
			limit: '50',
		});
	});

	test('omits blank or invalid values', () => {
		expect(
			buildFindStaffTenantRolesQueryParameters({
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
			'roles',
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
			'roles',
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
			'roles',
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
			'roles',
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

describe('staff tenant role permission-key cache snapshot', () => {
	test('reads normalized data and revision from the exact scoped query entry', () => {
		const queryClient = new QueryClient();
		const variables = { tenantId: 'tenant-1', roleId: 'role-1' };
		const queryKey = getStaffTenantRolePermissionKeysQueryKey(variables);
		queryClient.setQueryData(
			queryKey,
			{ permissionKeys: [' channels.view ', 'posts.view', 'posts.view'] },
			{ updatedAt: 42 },
		);

		expect(
			getStaffTenantRolePermissionKeysCacheSnapshot(queryClient, variables),
		).toEqual({
			permissionKeys: ['channels.view', 'posts.view'],
			revision: 1,
		});
	});

	test('advances the revision when data updates within the same millisecond', () => {
		const queryClient = new QueryClient();
		const variables = { tenantId: 'tenant-1', roleId: 'role-1' };
		const queryKey = getStaffTenantRolePermissionKeysQueryKey(variables);
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
			getStaffTenantRolePermissionKeysCacheSnapshot(queryClient, variables),
		).toEqual({
			permissionKeys: ['channels.view'],
			revision: 2,
		});
	});
});

describe('buildCreateStaffTenantRoleBody', () => {
	test('serializes the concrete icon and tone', () => {
		const body = buildCreateStaffTenantRoleBody({
			name: 'Approvers',
			icon: 'briefcase',
			tone: '6',
		});

		expect(unwrapUntyped(body.icon)).toBe('briefcase');
		expect(unwrapUntyped(body.tone)).toBe('6');
	});

	test('includes a trimmed description without serializing permission keys', () => {
		const body = buildCreateStaffTenantRoleBody({
			name: 'Approvers',
			description: '  Can review approvals  ',
		});

		expect(unwrapUntyped(body.name)).toBe('Approvers');
		expect(unwrapUntyped(body.description)).toBe('Can review approvals');
		expect(body.permissionKeys).toBeUndefined();
	});

	test('omits blank description and permission keys when not provided', () => {
		const body = buildCreateStaffTenantRoleBody({
			name: 'Approvers',
			description: '   ',
		});

		expect(unwrapUntyped(body.name)).toBe('Approvers');
		expect(body.description).toBeUndefined();
		expect(body.permissionKeys).toBeUndefined();
	});

	test('serializes populated permission keys as an untyped string array', () => {
		const body = buildCreateStaffTenantRoleBody({
			name: 'Approvers',
			permissionKeys: ['tenant.users.manage', 'tenant.users.read'],
		});

		expect(unwrapUntyped(body.permissionKeys)).toEqual([
			'tenant.users.manage',
			'tenant.users.read',
		]);
	});

	// buildUpdateStaffTenantRoleBody trims `name` (below); create does not — pinning the
	// current asymmetry rather than silently normalizing it away in the test.
	test('does not trim the name (current asymmetry with the update body builder)', () => {
		const body = buildCreateStaffTenantRoleBody({
			name: '  Approvers  ',
		});

		expect(unwrapUntyped(body.name)).toBe('  Approvers  ');
	});
});

describe('buildUpdateStaffTenantRoleBody', () => {
	test('serializes the concrete icon and tone', () => {
		const body = buildUpdateStaffTenantRoleBody({
			name: 'Approvers',
			icon: 'briefcase',
			tone: '6',
		});

		expect(unwrapUntyped(body.icon)).toBe('briefcase');
		expect(unwrapUntyped(body.tone)).toBe('6');
	});

	test('includes a trimmed description when provided', () => {
		const body = buildUpdateStaffTenantRoleBody({
			name: '  Approvers  ',
			description: '  Can review approvals  ',
		});

		expect(unwrapUntyped(body.name)).toBe('Approvers');
		expect(unwrapUntyped(body.description)).toBe('Can review approvals');
	});

	test('clears description with null when the value is blank', () => {
		const body = buildUpdateStaffTenantRoleBody({
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
		const body = buildUpdateStaffTenantRoleBody({
			name: 'Approvers',
			description: '',
		});

		expect(unwrapUntyped(body.name)).toBe('Approvers');
		expect(body.description).toBeNull();
	});

	test('serializes null icon and tone to restore automatic styling', () => {
		const body = buildUpdateStaffTenantRoleBody({
			name: 'Approvers',
			icon: null,
			tone: null,
		});

		expect(body.icon).toBeNull();
		expect(body.tone).toBeNull();
	});
});

describe('deleteStaffTenantRoleMutationOptions', () => {
	test('uses the generated tenant role delete client path', async () => {
		const deleteRole = vi.fn().mockResolvedValue({
			key: 'tenant-role-deleted-success',
			message: 'Tenant role deleted successfully',
		});
		const byRoleId = vi.fn((roleId: string) => ({
			delete: deleteRole,
			roleId,
		}));
		const byTenantId = vi.fn((tenantId: string) => ({
			roles: {
				byRoleId,
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

		const result = await deleteStaffTenantRoleMutationOptions.mutationFn({
			tenantId: 'tenant-123',
			roleId: 'role-456',
		});

		expect(deleteStaffTenantRoleMutationOptions.mutationKey).toEqual([
			'staff',
			'staff-tenants',
			'roles',
			'delete',
		]);
		expect(byTenantId).toHaveBeenCalledWith('tenant-123');
		expect(byRoleId).toHaveBeenCalledWith('role-456');
		expect(deleteRole).toHaveBeenCalledTimes(1);
		expect(result).toEqual({
			key: 'tenant-role-deleted-success',
			message: 'Tenant role deleted successfully',
		});
	});
});

describe('assignStaffTenantRolePermissionMutationOptions', () => {
	test('calls tenant role permission assignment path', async () => {
		const post = vi.fn().mockResolvedValue(undefined);
		const byPermissionKey = vi.fn((permissionKey: string) => ({
			post,
			permissionKey,
		}));
		const permissions = vi.fn(() => ({ byPermissionKey }));
		const byRoleId = vi.fn(() => ({
			permissions: permissions(),
		}));
		const byTenantId = vi.fn((tenantId: string) => ({
			roles: {
				byRoleId,
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
			await assignStaffTenantRolePermissionMutationOptions.mutationFn({
				tenantId: 'tenant-123',
				roleId: 'role-456',
				permissionKey: 'tenant.users.read',
			});

		expect(assignStaffTenantRolePermissionMutationOptions.mutationKey).toEqual([
			'staff',
			'staff',
			'staff-tenants',
			'roles',
			'permissions',
			'assign',
		]);
		expect(byTenantId).toHaveBeenCalledWith('tenant-123');
		expect(byRoleId).toHaveBeenCalledWith('role-456');
		expect(byPermissionKey).toHaveBeenCalledWith('tenant.users.read');
		expect(post).toHaveBeenCalledTimes(1);
		expect(result).toBeUndefined();
	});
});

describe('unassignStaffTenantRolePermissionMutationOptions', () => {
	test('calls tenant role permission unassignment path', async () => {
		const deletePermission = vi.fn().mockResolvedValue(undefined);
		const byPermissionKey = vi.fn((permissionKey: string) => ({
			delete: deletePermission,
			permissionKey,
		}));
		const permissions = vi.fn(() => ({ byPermissionKey }));
		const byRoleId = vi.fn(() => ({
			permissions: permissions(),
		}));
		const byTenantId = vi.fn((tenantId: string) => ({
			roles: {
				byRoleId,
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
			await unassignStaffTenantRolePermissionMutationOptions.mutationFn({
				tenantId: 'tenant-123',
				roleId: 'role-456',
				permissionKey: 'tenant.users.read',
			});

		expect(
			unassignStaffTenantRolePermissionMutationOptions.mutationKey,
		).toEqual([
			'staff',
			'staff',
			'staff-tenants',
			'roles',
			'permissions',
			'unassign',
		]);
		expect(byTenantId).toHaveBeenCalledWith('tenant-123');
		expect(byRoleId).toHaveBeenCalledWith('role-456');
		expect(byPermissionKey).toHaveBeenCalledWith('tenant.users.read');
		expect(deletePermission).toHaveBeenCalledTimes(1);
		expect(result).toBeUndefined();
	});
});

describe('assignStaffTenantRoleUserMutationOptions', () => {
	test('calls the per-member tenant role assignment (toggle) path', async () => {
		const post = vi.fn().mockResolvedValue(undefined);
		const byUser_account_id = vi.fn((userAccountId: string) => ({
			post,
			userAccountId,
		}));
		const users = vi.fn(() => ({ byUser_account_id }));
		const byRoleId = vi.fn(() => ({
			users: users(),
		}));
		const byTenantId = vi.fn((tenantId: string) => ({
			roles: {
				byRoleId,
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

		const result = await assignStaffTenantRoleUserMutationOptions.mutationFn({
			tenantId: 'tenant-123',
			roleId: 'role-456',
			userAccountId: 'user-account-789',
		});

		expect(assignStaffTenantRoleUserMutationOptions.mutationKey).toEqual([
			'staff',
			'staff-tenants',
			'roles',
			'users',
			'assign',
		]);
		expect(byTenantId).toHaveBeenCalledWith('tenant-123');
		expect(byRoleId).toHaveBeenCalledWith('role-456');
		expect(byUser_account_id).toHaveBeenCalledWith('user-account-789');
		expect(post).toHaveBeenCalledTimes(1);
		expect(result).toBeUndefined();
	});
});

describe('unassignStaffTenantRoleUserMutationOptions', () => {
	test('calls the per-member tenant role unassignment (toggle) path', async () => {
		const deleteMember = vi.fn().mockResolvedValue(undefined);
		const byUser_account_id = vi.fn((userAccountId: string) => ({
			delete: deleteMember,
			userAccountId,
		}));
		const users = vi.fn(() => ({ byUser_account_id }));
		const byRoleId = vi.fn(() => ({
			users: users(),
		}));
		const byTenantId = vi.fn((tenantId: string) => ({
			roles: {
				byRoleId,
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

		const result = await unassignStaffTenantRoleUserMutationOptions.mutationFn({
			tenantId: 'tenant-123',
			roleId: 'role-456',
			userAccountId: 'user-account-789',
		});

		expect(unassignStaffTenantRoleUserMutationOptions.mutationKey).toEqual([
			'staff',
			'staff-tenants',
			'roles',
			'users',
			'unassign',
		]);
		expect(byTenantId).toHaveBeenCalledWith('tenant-123');
		expect(byRoleId).toHaveBeenCalledWith('role-456');
		expect(byUser_account_id).toHaveBeenCalledWith('user-account-789');
		expect(deleteMember).toHaveBeenCalledTimes(1);
		expect(result).toBeUndefined();
	});
});

describe('toStaffTenantRoleRows', () => {
	test('normalizes API items and skips rows without usable ids', () => {
		const items: TenantRoleItem[] = [
			{
				id: 'role-1',
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

		expect(toStaffTenantRoleRows(items)).toEqual([
			{
				id: 'role-1',
				name: 'Approvers',
				description: 'Can review approvals',
				icon: 'briefcase',
				tone: '6',
				isDefault: true,
				isFullAccess: false,
				userAccountCount: 7,
				permissionsCount: 12,
			},
		]);
	});

	// shell-r5-F3: a row missing its required `name` used to be kept with a
	// `'—'` placeholder a staff admin can't distinguish from real data. It
	// must be dropped instead.
	test('drops a row with a blank/missing name rather than fabricating a placeholder', () => {
		const items: TenantRoleItem[] = [
			{
				id: 'role-2',
				name: null,
				description: ' ',
				isDefault: null,
				userAccountCount: null,
				permissionsCount: null,
			},
			{
				id: 'role-3',
				name: '   ',
				description: null,
				isDefault: false,
				userAccountCount: 0,
				permissionsCount: 0,
			},
		];

		expect(toStaffTenantRoleRows(items)).toEqual([]);
	});
});

describe('toStaffTenantRoleDetails', () => {
	test('normalizes a detail payload and preserves optional values', () => {
		const createdAt = new Date('2026-05-10T09:00:00Z');
		const updatedAt = new Date('2026-07-14T10:00:00Z');

		expect(
			toStaffTenantRoleDetails({
				role: {
					id: 'role-7',
					name: ' Approvers ',
					description: ' Can review approvals ',
					icon: ' briefcase ',
					tone: ' 6 ',
					isDefault: true,
					userAccountCount: 7,
					createdAt,
					updatedAt,
				},
			} as GetTenantRoleByIdResponse),
		).toEqual({
			id: 'role-7',
			name: 'Approvers',
			description: 'Can review approvals',
			icon: 'briefcase',
			tone: '6',
			isDefault: true,
			isFullAccess: false,
			userAccountCount: 7,
			createdAt,
			updatedAt,
		});
	});

	test('nulls out missing or invalid timestamps', () => {
		const result = toStaffTenantRoleDetails({
			role: {
				id: 'role-9',
				name: 'Approvers',
				createdAt: new Date('invalid'),
			},
		} as GetTenantRoleByIdResponse);

		expect(result?.createdAt).toBeNull();
		expect(result?.updatedAt).toBeNull();
	});

	test('returns null when the payload has no usable role id', () => {
		expect(
			toStaffTenantRoleDetails({
				role: {
					id: ' ',
					name: 'Approvers',
				},
			} as GetTenantRoleByIdResponse),
		).toBeNull();
	});

	// shell-r5-F3: a payload missing its required `name` used to be treated
	// as present-but-blank, fabricating a `'—'` placeholder. It must be
	// treated the same as "not found" instead.
	test('returns null when the payload has no usable name', () => {
		expect(
			toStaffTenantRoleDetails({
				role: {
					id: 'role-8',
					name: '   ',
				},
			} as GetTenantRoleByIdResponse),
		).toBeNull();
	});
});

describe('toStaffTenantRolePermissionKeys', () => {
	test('normalizes keys, removes blanks, de-duplicates, and keeps sorted order', () => {
		expect(
			toStaffTenantRolePermissionKeys({
				permissionKeys: [
					' tenant.users.manage ',
					'',
					'tenant.billing.view',
					'tenant.users.manage',
					null,
				],
			} as FindTenantRolePermissionsAsStaffResult),
		).toEqual(['tenant.billing.view', 'tenant.users.manage']);
	});

	test('returns an empty list when the payload is empty', () => {
		expect(toStaffTenantRolePermissionKeys(undefined)).toEqual([]);
	});
});

describe('buildUpdateStaffTenantRoleBody description branch', () => {
	test('omits description entirely when it was not provided', () => {
		const body = buildUpdateStaffTenantRoleBody({ name: 'Approvers' });

		expect('description' in body).toBe(false);
	});
});

describe('invalidateStaffTenantRoles', () => {
	test('invalidates the shared staff-tenant-roles scope prefix', () => {
		const invalidateQueries = vi.fn();

		void invalidateStaffTenantRoles({ invalidateQueries } satisfies Pick<
			QueryClient,
			'invalidateQueries'
		>);

		expect(invalidateQueries).toHaveBeenCalledWith({
			queryKey: ['staff', ...STAFF_TENANT_ROLES_QUERY_KEY],
		});
	});
});

describe('buildFindStaffTenantRoleMembersQueryParameters', () => {
	test('trims supported values, 1-indexes the page, and stringifies the limit', () => {
		expect(
			buildFindStaffTenantRoleMembersQueryParameters({
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
			buildFindStaffTenantRoleMembersQueryParameters({
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
			buildFindStaffTenantRoleMembersQueryParameters({ pageIndex: -3 }),
		).toEqual({
			page: '1',
			q: undefined,
			sortId: undefined,
			sortOrder: undefined,
			limit: undefined,
		});
	});
});

describe('toStaffTenantRoleMemberRows', () => {
	test('normalizes API items, prefers the full name, and skips rows without a usable id, userId, or email', () => {
		const items: TenantRoleUserItem[] = [
			{
				id: 'user-account-1',
				userId: 'user-1',
				email: ' ada@example.com ',
				firstName: ' Ada ',
				lastName: ' Lovelace ',
				avatarUrl: '/files/uploads/ada.png',
				status: 'Active',
				isFullAccess: true,
				otherRoles: [
					{
						id: 'role-1',
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
				isFullAccess: false,
				otherRoles: null,
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
				isFullAccess: false,
				otherRoles: [],
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
				isFullAccess: false,
				otherRoles: [],
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
				isFullAccess: false,
				otherRoles: [],
				joinedAt: null,
			},
		];

		expect(toStaffTenantRoleMemberRows(items)).toEqual([
			{
				id: 'user-account-1',
				userId: 'user-1',
				email: 'ada@example.com',
				firstName: 'Ada',
				lastName: 'Lovelace',
				avatarUrl: 'https://api.example.test/files/uploads/ada.png',
				status: 'Active',
				isFullAccess: true,
				otherRoles: [{ id: 'role-1', name: 'Editors' }],
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
				isFullAccess: false,
				otherRoles: [],
				joinedAt: null,
				displayName: 'grace@example.com',
			},
		]);
	});

	// step4b-review MAJOR 4: `id` (the tenant membership/user_account_id) and
	// `userId` (the global user id, needed to link to the member's own detail
	// page) are independent UUIDs — a row must carry both, distinctly.
	test('keeps id (user_account_id) and userId (global user id) as distinct fields', () => {
		const [row] = toStaffTenantRoleMemberRows([
			{
				id: 'user-account-9',
				userId: 'user-9',
				email: 'rae@example.com',
				firstName: 'Rae',
				lastName: 'Lee',
				avatarUrl: null,
				status: 'Active',
				isFullAccess: false,
				otherRoles: [],
				joinedAt: null,
			},
		]);

		expect(row?.id).toBe('user-account-9');
		expect(row?.userId).toBe('user-9');
		expect(row?.userId).not.toBe(row?.id);
	});

	test('returns an empty list when the payload is empty', () => {
		expect(toStaffTenantRoleMemberRows(undefined)).toEqual([]);
		expect(toStaffTenantRoleMemberRows(null)).toEqual([]);
	});
});

describe('buildResolveStaffTenantRoleMemberAssignmentsBody', () => {
	test('serializes the user account ids as an untyped string array', () => {
		const body = buildResolveStaffTenantRoleMemberAssignmentsBody([
			'user-account-1',
			'user-account-2',
		]);

		expect(unwrapUntyped(body.userAccountIds)).toEqual([
			'user-account-1',
			'user-account-2',
		]);
	});

	test('serializes an empty id list as an empty array', () => {
		const body = buildResolveStaffTenantRoleMemberAssignmentsBody([]);

		expect(unwrapUntyped(body.userAccountIds)).toEqual([]);
	});
});

describe('toStaffTenantRoleMemberAssignmentMap', () => {
	test('maps each user account id to its assigned boolean', () => {
		const result: ResolveTenantRoleUserAssignmentsAsStaffResult = {
			assignments: [
				{ userAccountId: 'user-account-1', isAssigned: true },
				{ userAccountId: 'user-account-2', isAssigned: false },
			],
		};

		expect(toStaffTenantRoleMemberAssignmentMap(result)).toEqual({
			'user-account-1': true,
			'user-account-2': false,
		});
	});

	test('skips assignments without a usable user account id', () => {
		const result: ResolveTenantRoleUserAssignmentsAsStaffResult = {
			assignments: [
				{ userAccountId: '', isAssigned: true },
				{ userAccountId: null, isAssigned: true },
			],
		};

		expect(toStaffTenantRoleMemberAssignmentMap(result)).toEqual({});
	});

	test('returns an empty map when the payload is empty', () => {
		expect(toStaffTenantRoleMemberAssignmentMap(undefined)).toEqual({});
	});
});
