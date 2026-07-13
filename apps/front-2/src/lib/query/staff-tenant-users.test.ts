import { beforeEach, describe, expect, test, vi } from 'vitest';
import {
	removeStaffTenantUserMutationOptions,
	bulkRemoveStaffTenantUsersMutationOptions,
	buildBulkRemoveStaffTenantUsersBody,
	buildCreateStaffTenantUserInvitationBody,
	buildExportStaffTenantUsersQueryParameters,
	buildFindStaffTenantUsersQueryParameters,
	buildUpdateStaffTenantUserBody,
	exportStaffTenantUsersMutationOptions,
	invalidateStaffTenantUsers,
	STAFF_TENANT_USERS_QUERY_KEY,
	toStaffTenantUserBulkActionSummary,
	toStaffTenantUserDetails,
	toStaffTenantUserRows,
} from '~/lib/query/staff-tenant-users';

import type {
	BulkTenantUserActionResult,
	TenantUserDetailsResult,
	TenantUserItem,
} from '@org/client-ts/src/models/index.js';

const mocks = vi.hoisted(() => ({
	getOrCreateStaffClient: vi.fn(),
}));

vi.mock('~/lib/api-client/client-manager', () => ({
	getClientManager: () => ({
		getOrCreateStaffClient: mocks.getOrCreateStaffClient,
	}),
	resolveApiBaseUrl: () => 'https://api.example.test',
}));

beforeEach(() => {
	vi.clearAllMocks();
});

describe('buildFindStaffTenantUsersQueryParameters', () => {
	test('trims supported values and stringifies page size', () => {
		expect(
			buildFindStaffTenantUsersQueryParameters({
				q: ' alex ',
				sortId: ' level ',
				sortOrder: 'asc',
				cursor: ' user-123 ',
				size: 50,
			}),
		).toEqual({
			q: 'alex',
			sortId: 'level',
			sortOrder: 'asc',
			cursor: 'user-123',
			limit: '50',
		});
	});

	test('omits blank or invalid values', () => {
		expect(
			buildFindStaffTenantUsersQueryParameters({
				q: '   ',
				sortId: '',
				sortOrder: undefined,
				cursor: ' ',
				size: 0,
			}),
		).toEqual({});
	});

	test('trims and forwards the level filter', () => {
		expect(
			buildFindStaffTenantUsersQueryParameters({
				level: ' admin ',
			}),
		).toEqual({
			level: 'admin',
		});
	});

	test('omits a blank level filter', () => {
		expect(
			buildFindStaffTenantUsersQueryParameters({
				level: '   ',
			}),
		).toEqual({});
	});
});

describe('buildCreateStaffTenantUserInvitationBody', () => {
	test('trims email and account level and wraps them for the API contract', () => {
		expect(
			buildCreateStaffTenantUserInvitationBody({
				email: '  alice@example.com  ',
				accountLevel: 'User',
			}),
		).toMatchObject({
			email: { value: 'alice@example.com' },
			accountLevel: { value: 'User' },
		});
	});

	test('drops missing values', () => {
		expect(
			buildCreateStaffTenantUserInvitationBody({
				email: '   ',
			}),
		).toEqual({});
	});

	test('buildUpdateStaffTenantUserBody', () => {
		expect(
			buildUpdateStaffTenantUserBody({
				firstName: ' Alex ',
				lastName: '   ',
				avatarUrl: ' https://example.com/avatar.png ',
				accountLevel: 'Admin',
			}),
		).toMatchObject({
			firstName: { value: 'Alex' },
			lastName: null,
			avatarUrl: { value: 'https://example.com/avatar.png' },
		});

		expect(
			buildUpdateStaffTenantUserBody({
				firstName: ' Alex ',
				lastName: '   ',
				avatarUrl: ' https://example.com/avatar.png ',
				accountLevel: 'Admin',
			}).level,
		).toMatchObject({ value: 'Admin' });

		expect(
			buildUpdateStaffTenantUserBody({
				firstName: undefined,
				lastName: undefined,
				avatarUrl: undefined,
				accountLevel: undefined,
			}),
		).toEqual({});
	});

	test('buildUpdateStaffTenantUserBody strips the API origin off a same-origin avatarUrl', () => {
		expect(
			buildUpdateStaffTenantUserBody({
				avatarUrl: 'https://api.example.test/files/uploads/2026/07/alex.png',
			}),
		).toMatchObject({
			avatarUrl: { value: '/files/uploads/2026/07/alex.png' },
		});
	});
});

describe('toStaffTenantUserRows', () => {
	test('normalizes API items, builds display names, and skips rows without usable ids', () => {
		const items: TenantUserItem[] = [
			{
				id: 'user-1' as never,
				firstName: ' Alex ',
				lastName: ' Johnson ',
				email: ' alex@example.com ',
				level: ' Admin ',
				status: ' Active ',
				avatarUrl: ' https://example.com/alex.png ',
			},
			{
				id: '' as never,
				firstName: 'Skip',
				lastName: 'Me',
				email: 'skip@example.com',
				level: 'Member',
				status: 'Active',
			},
			{
				id: 'user-2' as never,
				firstName: ' ',
				lastName: null,
				email: ' second@example.com ',
				level: null,
				status: ' ',
				avatarUrl: null,
			},
		];

		expect(toStaffTenantUserRows(items)).toEqual([
			{
				id: 'user-1',
				firstName: 'Alex',
				lastName: 'Johnson',
				email: 'alex@example.com',
				level: 'Admin',
				status: 'Active',
				avatarUrl: 'https://example.com/alex.png',
				displayName: 'Alex Johnson',
			},
			{
				id: 'user-2',
				firstName: null,
				lastName: null,
				email: 'second@example.com',
				level: null,
				status: null,
				avatarUrl: null,
				displayName: 'second@example.com',
			},
		]);
	});

	test('resolves a root-relative /files/ avatarUrl against the API origin', () => {
		const [row] = toStaffTenantUserRows([
			{
				id: 'user-3' as never,
				firstName: 'Rae',
				lastName: 'Lee',
				email: 'rae@example.com',
				level: 'User',
				status: 'Active',
				avatarUrl: '/files/uploads/2026/07/alex.png',
			},
		]);

		expect(row?.avatarUrl).toBe(
			'https://api.example.test/files/uploads/2026/07/alex.png',
		);
	});
});

describe('toStaffTenantUserDetails', () => {
	test('normalizes a detail payload and builds a stable display name', () => {
		const result = toStaffTenantUserDetails({
			id: ' user-9 ',
			email: ' owner@publyapp.local ',
			firstName: ' Owner ',
			lastName: ' User ',
			avatarUrl: ' https://example.com/avatar.png ',
			level: 'Admin',
			status: ' Active ',
			tenantId: ' 11111111-1111-1111-1111-111111111111 ',
			createdAt: new Date('invalid'),
		} as TenantUserDetailsResult);

		expect(result).toEqual({
			id: 'user-9',
			email: 'owner@publyapp.local',
			firstName: 'Owner',
			lastName: 'User',
			avatarUrl: 'https://example.com/avatar.png',
			accountLevel: 'Admin',
			status: 'Active',
			tenantId: '11111111-1111-1111-1111-111111111111',
			createdAt: null,
			updatedAt: null,
			displayName: 'Owner User',
		});
	});

	test('preserves and trims tenant membership status values for lifecycle UI decisions', () => {
		const result = toStaffTenantUserDetails({
			id: ' user-9 ',
			email: ' owner@publyapp.local ',
			level: 'Admin',
			status: ' Suspended ',
			createdAt: new Date('2026-07-01T09:00:00Z'),
		} as TenantUserDetailsResult);

		expect(result?.status).toBe('Suspended');
	});

	test('returns null when the payload has no usable id', () => {
		expect(
			toStaffTenantUserDetails({
				id: ' ',
				email: 'owner@publyapp.local',
			} as TenantUserDetailsResult),
		).toBeNull();
	});
});

describe('removeStaffTenantUserMutationOptions', () => {
	test('calls the generated delete mutation for tenant-user removal', async () => {
		const removeUser = vi.fn().mockResolvedValue({
			key: 'tenant-user-removed-success',
			message: 'Tenant user was removed',
		});
		const byUserId = vi.fn((userId: string) => ({
			delete: removeUser,
			userId,
		}));
		const users = {
			byUserId,
		};
		const byTenantId = vi.fn((tenantId: string) => ({
			users,
			tenantId,
		}));

		mocks.getOrCreateStaffClient.mockReturnValue({
			staff: {
				tenants: {
					byTenantId,
				},
			},
		});

		const result = await removeStaffTenantUserMutationOptions.mutationFn({
			tenantId: 'tenant-001',
			userId: 'user-999',
		});

		expect(removeStaffTenantUserMutationOptions.mutationKey).toEqual([
			'staff',
			'staff-tenants',
			'users',
			'remove',
		]);
		expect(byTenantId).toHaveBeenCalledWith('tenant-001');
		expect(byUserId).toHaveBeenCalledWith('user-999');
		expect(removeUser).toHaveBeenCalledTimes(1);
		expect(result).toEqual({
			key: 'tenant-user-removed-success',
			message: 'Tenant user was removed',
		});
	});
});

describe('buildBulkRemoveStaffTenantUsersBody', () => {
	test('wraps user ids for the API contract', () => {
		const body = buildBulkRemoveStaffTenantUsersBody(['user-1', 'user-2']);

		expect(body.userIds).toMatchObject({
			value: [{ value: 'user-1' }, { value: 'user-2' }],
		});
	});
});

describe('buildExportStaffTenantUsersQueryParameters', () => {
	test('trims filters and joins selected ids as csv', () => {
		expect(
			buildExportStaffTenantUsersQueryParameters({
				q: ' alex ',
				status: ' active ',
				level: ' admin ',
				ids: ['user-1', 'user-2'],
			}),
		).toEqual({
			q: 'alex',
			status: 'active',
			level: 'admin',
			ids: 'user-1,user-2',
		});
	});

	test('omits blank filters and an empty id list', () => {
		expect(
			buildExportStaffTenantUsersQueryParameters({
				q: '   ',
				status: undefined,
				level: undefined,
				ids: [],
			}),
		).toEqual({});
	});
});

describe('toStaffTenantUserBulkActionSummary', () => {
	test('normalizes counts and failed items, unescaping the error field', () => {
		const result: BulkTenantUserActionResult = {
			succeededCount: 2,
			failedCount: 1,
			failedItems: [
				{
					userId: 'user-3' as never,
					errorEscaped: 'Cannot remove the last admin from the tenant',
				},
			],
		};

		expect(toStaffTenantUserBulkActionSummary(result)).toEqual({
			succeededCount: 2,
			failedCount: 1,
			failedItems: [
				{
					userId: 'user-3',
					error: 'Cannot remove the last admin from the tenant',
				},
			],
		});
	});

	test('defaults to zero counts and an empty list for an empty payload', () => {
		expect(toStaffTenantUserBulkActionSummary(undefined)).toEqual({
			succeededCount: 0,
			failedCount: 0,
			failedItems: [],
		});
	});
});

describe('bulkRemoveStaffTenantUsersMutationOptions', () => {
	test('calls the generated bulk-remove mutation with wrapped user ids', async () => {
		const bulkRemovePost = vi.fn().mockResolvedValue({
			succeededCount: 1,
			failedCount: 0,
			failedItems: [],
		});
		const users = { bulkRemove: { post: bulkRemovePost } };
		const byTenantId = vi.fn((tenantId: string) => ({ users, tenantId }));

		mocks.getOrCreateStaffClient.mockReturnValue({
			staff: { tenants: { byTenantId } },
		});

		const result = await bulkRemoveStaffTenantUsersMutationOptions.mutationFn({
			tenantId: 'tenant-001',
			userIds: ['user-1', 'user-2'],
		});

		expect(byTenantId).toHaveBeenCalledWith('tenant-001');
		expect(bulkRemovePost).toHaveBeenCalledTimes(1);
		expect(bulkRemovePost.mock.calls[0]?.[0]).toMatchObject({
			userIds: { value: [{ value: 'user-1' }, { value: 'user-2' }] },
		});
		expect(result).toEqual({
			succeededCount: 1,
			failedCount: 0,
			failedItems: [],
		});
	});
});

describe('exportStaffTenantUsersMutationOptions', () => {
	test('calls the generated export endpoint with the selected ids', async () => {
		const buffer = new ArrayBuffer(4);
		const exportGet = vi.fn().mockResolvedValue(buffer);
		const users = { exportEscaped: { get: exportGet } };
		const byTenantId = vi.fn((tenantId: string) => ({ users, tenantId }));

		mocks.getOrCreateStaffClient.mockReturnValue({
			staff: { tenants: { byTenantId } },
		});

		const result = await exportStaffTenantUsersMutationOptions.mutationFn({
			tenantId: 'tenant-001',
			ids: ['user-1'],
		});

		expect(byTenantId).toHaveBeenCalledWith('tenant-001');
		expect(exportGet).toHaveBeenCalledWith({
			queryParameters: { ids: 'user-1' },
		});
		expect(result).toBe(buffer);
	});
});

describe('invalidateStaffTenantUsers', () => {
	test('invalidates the shared staff-tenant-users scope prefix', () => {
		const invalidateQueries = vi.fn();

		void invalidateStaffTenantUsers({ invalidateQueries } as never);

		expect(invalidateQueries).toHaveBeenCalledWith({
			queryKey: ['staff', ...STAFF_TENANT_USERS_QUERY_KEY],
		});
	});
});
