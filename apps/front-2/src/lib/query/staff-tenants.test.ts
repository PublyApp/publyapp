import { beforeEach, describe, expect, test, vi } from 'vitest';
import {
	buildCreateStaffTenantBody,
	buildUpdateStaffTenantBody,
	buildFindStaffTenantsQueryParameters,
	suspendStaffTenantMutationOptions,
	reactivateStaffTenantMutationOptions,
	deleteStaffTenantMutationOptions,
	createStaffTenantMutationOptions,
	staffTenantsQueryOptions,
	STAFF_TENANTS_QUERY_KEY,
	STAFF_TENANT_DETAILS_QUERY_KEY,
	updateStaffTenantMutationOptions,
	toStaffTenantDetails,
	toStaffTenantRows,
} from '~/lib/query/staff-tenants';

import type {
	ApiResponse,
	CreateTenantAsStaffResult,
	GetTenantAsStaffResult,
	TenantReactivatedResult,
	TenantSuspendedResult,
	TenantAsStaffListItem,
	UpdateTenantAsStaffBody,
} from '@org/client-ts/src/models/index.js';

const mocks = vi.hoisted(() => ({
	getOrCreateStaffClient: vi.fn(),
}));

vi.mock('~/lib/api-client/client-manager', () => ({
	getClientManager: () => ({
		getOrCreateStaffClient: mocks.getOrCreateStaffClient,
	}),
}));

beforeEach(() => {
	vi.clearAllMocks();
});

const getUntypedArray = (value: unknown) => {
	if (!value || typeof value !== 'object') {
		return undefined;
	}

	const { value: array } = value as { value?: unknown };
	return Array.isArray(array) ? array : undefined;
};

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

describe('buildCreateStaffTenantBody', () => {
	test('trims values and wraps API contract fields', () => {
		const body = buildCreateStaffTenantBody({
			name: '  Acme Tenant  ',
			maxUsers: 12,
			initialUsers: [
				{
					email: ' user1@example.com ',
					accountLevel: ' User ',
				},
				{
					email: 'user2@example.com',
					accountLevel: 'Admin',
				},
			],
		});

		expect(unwrapUntyped(body.name)).toBe('Acme Tenant');
		expect(unwrapUntyped(body.maxUsers)).toBe(12);
		expect(unwrapUntyped(body.initialUsers)).toMatchObject([
			{
				email: 'user1@example.com',
				accountLevel: 'User',
			},
			{
				email: 'user2@example.com',
				accountLevel: 'Admin',
			},
		]);
	});

	test('drops blank user rows in the initial users list', () => {
		const body = buildCreateStaffTenantBody({
			name: 'Acme Tenant',
			maxUsers: 5,
			initialUsers: [
				{
					email: ' ',
					accountLevel: 'Admin',
				},
				{
					email: 'user@example.com',
					accountLevel: 'User',
				},
				{
					email: '   ',
					accountLevel: '   ',
				},
			],
		});

		expect(getUntypedArray(body.initialUsers)).toHaveLength(1);
		expect(unwrapUntyped(body.initialUsers)).toMatchObject([
			{
				email: 'user@example.com',
				accountLevel: 'User',
			},
		]);
	});
});

describe('buildUpdateStaffTenantBody', () => {
	test('normalizes name, numeric, and nullable string fields', () => {
		const body = buildUpdateStaffTenantBody({
			name: '  Acme Tenant  ',
			maxUsers: 10,
			logoUrl: ' https://cdn.example.com/acme-logo.png ',
		});

		expect(unwrapUntyped(body.name)).toBe('Acme Tenant');
		expect(unwrapUntyped(body.maxUsers)).toBe(10);
		expect(unwrapUntyped(body.logoUrl)).toBe(
			'https://cdn.example.com/acme-logo.png',
		);
	});

	test('sends explicit null when optional string fields are cleared', () => {
		const body = buildUpdateStaffTenantBody({
			logoUrl: '   ',
		});

		expect((body as UpdateTenantAsStaffBody).logoUrl).toBeNull();
	});
});

describe('createStaffTenantMutationOptions', () => {
	test('calls the generated staff tenant create path with a normalized body', async () => {
		const post = vi.fn().mockResolvedValue({
			id: 'tenant-001',
		} as CreateTenantAsStaffResult);
		mocks.getOrCreateStaffClient.mockReturnValue({
			staff: {
				tenants: {
					post,
				},
			},
		});

		const result = await createStaffTenantMutationOptions.mutationFn({
			name: 'Acme Tenant',
			maxUsers: 5,
			initialUsers: [{ email: 'user@example.com', accountLevel: 'Admin' }],
		});

		expect(createStaffTenantMutationOptions.mutationKey).toEqual([
			'staff',
			...STAFF_TENANTS_QUERY_KEY,
			'create',
		]);
		expect(post).toHaveBeenCalledTimes(1);
		expect(unwrapUntyped(post.mock.calls[0][0])).toEqual({
			name: 'Acme Tenant',
			maxUsers: 5,
			initialUsers: [
				{
					email: 'user@example.com',
					accountLevel: 'Admin',
				},
			],
		});
		expect(result).toEqual({ id: 'tenant-001' });
	});
});

describe('updateStaffTenantMutationOptions', () => {
	test('calls the generated staff tenant patch path with a normalized body', async () => {
		const patch = vi.fn().mockResolvedValue({
			tenantId: 'tenant-001',
		} as GetTenantAsStaffResult);
		const byTenantId = vi.fn().mockReturnValue({
			patch,
		});
		mocks.getOrCreateStaffClient.mockReturnValue({
			staff: {
				tenants: {
					byTenantId,
				},
			},
		});

		const result = await updateStaffTenantMutationOptions.mutationFn({
			tenantId: 'tenant-001',
			name: '  Acme Tenant  ',
			maxUsers: 25,
			logoUrl: '   ',
		});

		expect(byTenantId).toHaveBeenCalledTimes(1);
		expect(updateStaffTenantMutationOptions.mutationKey).toEqual([
			'staff',
			...STAFF_TENANTS_QUERY_KEY,
			'update',
		]);
		expect(byTenantId).toHaveBeenCalledWith('tenant-001');
		expect(patch).toHaveBeenCalledTimes(1);
		expect(unwrapUntyped(patch.mock.calls[0][0])).toEqual({
			name: 'Acme Tenant',
			maxUsers: 25,
			logoUrl: null,
		});
		expect(result).toEqual({
			tenantId: 'tenant-001',
		});
	});
});

describe('suspendStaffTenantMutationOptions', () => {
	test('calls the generated tenant suspend path with an empty request body', async () => {
		const post = vi.fn().mockResolvedValue({
			tenantId: 'tenant-001',
			name: 'Acme Corporation',
			status: 'Suspended',
		} as TenantSuspendedResult);
		const byTenantId = vi.fn().mockReturnValue({
			suspend: { post },
		});
		mocks.getOrCreateStaffClient.mockReturnValue({
			staff: {
				tenants: {
					byTenantId,
				},
			},
		});

		const result = await suspendStaffTenantMutationOptions.mutationFn({
			tenantId: 'tenant-001',
		});

		expect(suspendStaffTenantMutationOptions.mutationKey).toEqual([
			'staff',
			...STAFF_TENANTS_QUERY_KEY,
			'suspend',
		]);
		expect(byTenantId).toHaveBeenCalledWith('tenant-001');
		expect(post).toHaveBeenCalledWith({});
		expect(result).toEqual({
			tenantId: 'tenant-001',
			name: 'Acme Corporation',
			status: 'Suspended',
		});
	});
});

describe('reactivateStaffTenantMutationOptions', () => {
	test('calls the generated tenant reactivate mutation path', async () => {
		const post = vi.fn().mockResolvedValue({
			tenantId: 'tenant-001',
			name: 'Acme Corporation',
			status: 'Active',
		} as TenantReactivatedResult);
		const byTenantId = vi.fn().mockReturnValue({
			reactivate: { post },
		});
		mocks.getOrCreateStaffClient.mockReturnValue({
			staff: {
				tenants: {
					byTenantId,
				},
			},
		});

		const result = await reactivateStaffTenantMutationOptions.mutationFn({
			tenantId: 'tenant-001',
		});

		expect(reactivateStaffTenantMutationOptions.mutationKey).toEqual([
			'staff',
			...STAFF_TENANTS_QUERY_KEY,
			'reactivate',
		]);
		expect(byTenantId).toHaveBeenCalledWith('tenant-001');
		expect(post).toHaveBeenCalledWith();
		expect(result).toEqual({
			tenantId: 'tenant-001',
			name: 'Acme Corporation',
			status: 'Active',
		});
	});
});

describe('deleteStaffTenantMutationOptions', () => {
	test('calls the generated tenant delete mutation path', async () => {
		const deleteFn = vi.fn().mockResolvedValue({
			key: 'tenant-deleted-success',
			message: 'Tenant was deleted',
		} as ApiResponse);
		const byTenantId = vi.fn().mockReturnValue({
			delete: deleteFn,
		});
		mocks.getOrCreateStaffClient.mockReturnValue({
			staff: {
				tenants: {
					byTenantId,
				},
			},
		});

		const result = await deleteStaffTenantMutationOptions.mutationFn({
			tenantId: 'tenant-001',
		});

		expect(deleteStaffTenantMutationOptions.mutationKey).toEqual([
			'staff',
			...STAFF_TENANTS_QUERY_KEY,
			'delete',
		]);
		expect(byTenantId).toHaveBeenCalledWith('tenant-001');
		expect(deleteFn).toHaveBeenCalledWith();
		expect(result).toEqual({
			key: 'tenant-deleted-success',
			message: 'Tenant was deleted',
		});
	});
});

describe('buildFindStaffTenantsQueryParameters', () => {
	test('trims supported values and stringifies page size', () => {
		expect(
			buildFindStaffTenantsQueryParameters({
				q: ' acme ',
				status: ' Active,Pending ',
				sortId: ' name ',
				sortOrder: 'asc',
				cursor: ' tenant-123 ',
				size: 50,
			}),
		).toEqual({
			q: 'acme',
			status: 'Active,Pending',
			sortId: 'name',
			sortOrder: 'asc',
			cursor: 'tenant-123',
			limit: '50',
		});
	});

	test('omits blank or invalid values', () => {
		expect(
			buildFindStaffTenantsQueryParameters({
				q: '   ',
				status: ' ',
				sortId: '',
				sortOrder: undefined,
				cursor: ' ',
				size: 0,
			}),
		).toEqual({});
	});

	test('builds a tenant details query key with a stable prefix', () => {
		expect(STAFF_TENANT_DETAILS_QUERY_KEY).toEqual(['staff-tenants', 'detail']);
	});
});

describe('staffTenantsQueryOptions.queryKey', () => {
	test('changes when the status filter changes, so switching filters never serves stale cached rows', () => {
		const noFilter = staffTenantsQueryOptions.queryKey({});
		const active = staffTenantsQueryOptions.queryKey({ status: 'active' });
		const suspended = staffTenantsQueryOptions.queryKey({
			status: 'suspended',
		});

		expect(active).not.toEqual(suspended);
		expect(active).not.toEqual(noFilter);
		expect(suspended).not.toEqual(noFilter);
		expect(active).toEqual([
			'staff',
			...STAFF_TENANTS_QUERY_KEY,
			{ status: 'active' },
		]);
		expect(suspended).toEqual([
			'staff',
			...STAFF_TENANTS_QUERY_KEY,
			{ status: 'suspended' },
		]);
		expect(noFilter).toEqual(['staff', ...STAFF_TENANTS_QUERY_KEY]);
	});
});

describe('toStaffTenantRows', () => {
	test('normalizes API items and skips rows without usable ids', () => {
		const items: TenantAsStaffListItem[] = [
			{
				id: 'tenant-1',
				name: ' Acme Corporation ',
				status: ' Active ',
				usersCount: 12,
				maxUsers: 50,
			},
			{
				id: '',
				name: 'Skip me',
				status: 'Pending',
				usersCount: 1,
				maxUsers: 10,
			},
			{
				id: 'tenant-2',
				name: null,
				status: null,
				usersCount: null,
				maxUsers: null,
			},
		];

		expect(toStaffTenantRows(items)).toEqual([
			{
				id: 'tenant-1',
				name: 'Acme Corporation',
				status: 'Active',
				usersCount: 12,
				maxUsers: 50,
			},
			{
				id: 'tenant-2',
				name: '—',
				status: null,
				usersCount: 0,
				maxUsers: 0,
			},
		]);
	});
});

describe('toStaffTenantDetails', () => {
	test('normalizes a detail payload and preserves optional values', () => {
		const createdAt = new Date('2026-07-01T08:30:00Z');

		const result = toStaffTenantDetails({
			tenantId: 'tenant-7',
			name: ' Acme Corporation ',
			code: ' ACME ',
			status: ' Active ',
			usersCount: 12,
			maxUsers: 50,
			logoUrl: ' https://cdn.example.com/acme.png ',
			createdAt,
			updatedAt: new Date('invalid'),
		} as GetTenantAsStaffResult);

		expect(result).toEqual({
			id: 'tenant-7',
			name: 'Acme Corporation',
			code: 'ACME',
			status: 'Active',
			usersCount: 12,
			maxUsers: 50,
			logoUrl: 'https://cdn.example.com/acme.png',
			createdAt,
			updatedAt: null,
		});
	});

	test('returns null when the payload has no usable tenant id', () => {
		expect(
			toStaffTenantDetails({
				tenantId: ' ',
				name: 'Acme Corporation',
			} as GetTenantAsStaffResult),
		).toBeNull();
	});
});
