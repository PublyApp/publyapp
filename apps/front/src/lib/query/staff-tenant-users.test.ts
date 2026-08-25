import type { QueryClient } from '@tanstack/react-query';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import {
	bulkCreateStaffTenantInvitationsMutationOptions,
	removeStaffTenantUserMutationOptions,
	bulkRemoveStaffTenantUsersMutationOptions,
	buildBulkCreateStaffTenantInvitationsBody,
	buildBulkRemoveStaffTenantUsersBody,
	buildCreateStaffTenantUserInvitationBody,
	createStaffTenantUserInvitationMutationOptions,
	buildExportStaffTenantUsersQueryParameters,
	buildFindStaffTenantUsersQueryParameters,
	buildUpdateStaffTenantUserBody,
	exportStaffTenantUsersMutationOptions,
	invalidateStaffTenantUsers,
	STAFF_TENANT_USERS_QUERY_KEY,
	toStaffTenantUserBulkActionSummary,
	toStaffTenantInvitationBulkCreateSummary,
	toStaffTenantUserDetails,
	toStaffTenantUserRows,
} from '~/lib/query/staff-tenant-users';

import type {
	BulkCreateTenantInvitationsForTenantAsStaffCreated,
	BulkRemoveTenantUsersResult,
	TenantUserDetailsResult,
	TenantUserItem,
} from '@org/client-ts/models/index';

const mocks = vi.hoisted(() => ({
	getOrCreateStaffClient: vi.fn(),
	useMutation: vi.fn((options: unknown) => options),
}));

vi.mock('@tanstack/react-query', () => ({
	useMutation: mocks.useMutation,
	useQuery: vi.fn(),
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
	test('marks invitation validation as handled by its form', () => {
		// Under the mocked useMutation (identity), calling the hook returns
		// exactly the options object buildStaffMutationOptions produced —
		// meta included. Asserting on the same options object the hook wires
		// pins the contract without widening through unknown.
		const mutationOptions = createStaffTenantUserInvitationMutationOptions;

		expect(mutationOptions.meta).toEqual({
			successMessage: 'invitation-sent-success',
			validationHandledByForm: true,
		});
	});

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

describe('buildBulkCreateStaffTenantInvitationsBody', () => {
	test('wraps every invitee email, account level, and profile id for Kiota', () => {
		expect(
			buildBulkCreateStaffTenantInvitationsBody([
				{
					email: '  alice@example.com  ',
					accountLevel: 'Admin',
					profileIds: ['profile-1', 'profile-2'],
				},
				{
					email: 'bob@example.com',
					accountLevel: 'User',
					profileIds: [],
				},
			]),
		).toMatchObject({
			invitations: {
				value: [
					{
						value: {
							email: { value: 'alice@example.com' },
							accountLevel: { value: 'Admin' },
							profileIds: {
								value: [{ value: 'profile-1' }, { value: 'profile-2' }],
							},
						},
					},
					{
						value: {
							email: { value: 'bob@example.com' },
							accountLevel: { value: 'User' },
							profileIds: { value: [] },
						},
					},
				],
			},
		});
	});
});

describe('toStaffTenantInvitationBulkCreateSummary', () => {
	test('normalizes counts and keeps failed invitee identity plus translation key', () => {
		const result: BulkCreateTenantInvitationsForTenantAsStaffCreated = {
			succeededCount: 1,
			failedCount: 1,
			failedItems: [
				{
					index: 1,
					email: ' bob@example.com ',
					reason: 'Raw server reason',
					translationKey: 'pending-invitation-exists',
				},
			],
		};

		expect(toStaffTenantInvitationBulkCreateSummary(result)).toEqual({
			succeededCount: 1,
			failedCount: 1,
			failedItems: [
				{
					index: 1,
					email: 'bob@example.com',
					translationKey: 'pending-invitation-exists',
				},
			],
		});
	});
});

describe('bulkCreateStaffTenantInvitationsMutationOptions', () => {
	test('uses the generated tenant bulk invitation endpoint with local feedback ownership', async () => {
		const post = vi.fn().mockResolvedValue({
			succeededCount: 1,
			failedCount: 0,
			failedItems: [],
		});
		const byTenantId = vi.fn(() => ({
			users: { invitations: { bulk: { post } } },
		}));
		mocks.getOrCreateStaffClient.mockReturnValue({
			staff: { tenants: { byTenantId } },
		});

		const result =
			await bulkCreateStaffTenantInvitationsMutationOptions.mutationFn({
				tenantId: 'tenant-001',
				invitations: [
					{
						email: 'alice@example.com',
						accountLevel: 'User',
						profileIds: ['profile-1'],
					},
				],
			});

		expect(byTenantId).toHaveBeenCalledWith('tenant-001');
		expect(post).toHaveBeenCalledOnce();
		expect(result).toMatchObject({ succeededCount: 1, failedCount: 0 });
		expect(bulkCreateStaffTenantInvitationsMutationOptions.meta).toEqual({
			silentSuccess: true,
			skipGlobalErrorHandler: true,
			validationHandledByForm: true,
		});
	});
});

describe('toStaffTenantUserRows', () => {
	test('normalizes API items, builds display names, and skips rows without usable ids', () => {
		const items: TenantUserItem[] = [
			{
				id: 'user-1',
				userAccountId: 'account-1',
				firstName: ' Alex ',
				lastName: ' Johnson ',
				email: ' alex@example.com ',
				level: ' Admin ',
				status: ' Active ',
				avatarUrl: ' https://example.com/alex.png ',
			},
			{
				id: '',
				userAccountId: 'account-skip',
				firstName: 'Skip',
				lastName: 'Me',
				email: 'skip@example.com',
				level: 'Member',
				status: 'Active',
			},
			{
				id: 'user-2',
				userAccountId: 'account-2',
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
				userAccountId: 'account-1',
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
				userAccountId: 'account-2',
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

	// step4b-review BLOCKER 1: the global user id and the tenant membership
	// (user_account_id) are independent UUIDs. A row must carry both, and they
	// must never be silently collapsed into the same value.
	test('keeps id (global user id) and userAccountId (tenant membership id) as distinct fields', () => {
		const [row] = toStaffTenantUserRows([
			{
				id: 'user-3',
				userAccountId: 'account-3',
				firstName: 'Rae',
				lastName: 'Lee',
				email: 'rae@example.com',
				level: 'User',
				status: 'Active',
			},
		]);

		expect(row?.id).toBe('user-3');
		expect(row?.userAccountId).toBe('account-3');
		expect(row?.userAccountId).not.toBe(row?.id);
	});

	// step4b-review BLOCKER 1: a row missing `userAccountId` is just as
	// malformed as one missing `id`/`email` — dropped rather than letting a
	// caller fall back to the wrong identity domain for membership ops.
	test('drops a row with a blank/missing userAccountId', () => {
		const items: TenantUserItem[] = [
			{
				id: 'user-6',
				userAccountId: '',
				firstName: 'No',
				lastName: 'Account',
				email: 'no-account@example.com',
				level: 'User',
				status: 'Active',
			},
			{
				id: 'user-7',
				userAccountId: null,
				firstName: 'Also',
				lastName: 'Missing',
				email: 'also-missing@example.com',
				level: 'User',
				status: 'Active',
			},
		];

		expect(toStaffTenantUserRows(items)).toEqual([]);
	});

	test('resolves a root-relative /files/ avatarUrl against the API origin', () => {
		const [row] = toStaffTenantUserRows([
			{
				id: 'user-3',
				userAccountId: 'account-3',
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

	// shell-r5-F3: a row missing its required `email` (the fallback identity
	// `getDisplayName` reads when no name is set) used to be kept with a
	// `'—'` placeholder a staff admin can't distinguish from real data. It
	// must be dropped instead.
	test('drops a row with a blank/missing email rather than fabricating a placeholder', () => {
		const items: TenantUserItem[] = [
			{
				id: 'user-4',
				userAccountId: 'account-4',
				firstName: 'Nobody',
				lastName: 'Home',
				email: '   ',
				level: 'Member',
				status: 'Active',
			},
			{
				id: 'user-5',
				userAccountId: 'account-5',
				email: null,
			},
		];

		expect(toStaffTenantUserRows(items)).toEqual([]);
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

	// shell-r5-F3: a payload missing its required `email` used to be treated
	// as present-but-blank, letting `displayName` fabricate a `'—'`
	// placeholder. It must be treated the same as "not found" instead.
	test('returns null when the payload has no usable email', () => {
		expect(
			toStaffTenantUserDetails({
				id: 'user-9',
				email: '   ',
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
		const result: BulkRemoveTenantUsersResult = {
			succeededCount: 2,
			failedCount: 1,
			failedItems: [
				{
					userId: 'user-3',
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

		void invalidateStaffTenantUsers({ invalidateQueries } satisfies Pick<
			QueryClient,
			'invalidateQueries'
		>);

		expect(invalidateQueries).toHaveBeenCalledWith({
			queryKey: ['staff', ...STAFF_TENANT_USERS_QUERY_KEY],
		});
	});
});
