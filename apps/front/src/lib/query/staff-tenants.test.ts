import type { QueryClient } from '@tanstack/react-query';
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
	invalidateStaffTenants,
	invalidateAllStaffTenantScopes,
} from '~/lib/query/staff-tenants';

import { TenantStatusObject } from '@org/client-ts/models/index';
import type {
	ApiResponse,
	CreateTenantAsStaffResult,
	GetTenantAsStaffResult,
	TenantReactivatedResult,
	TenantSuspendedResult,
	TenantAsStaffListItem,
	UpdateTenantAsStaffBody,
} from '@org/client-ts/models/index';

const API_BASE_URL = 'https://api.example.test';

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

const getUntypedArray = (value: unknown) => {
	if (!value || typeof value !== 'object') {
		return undefined;
	}

	const { value: array } = value as { value?: unknown };
	return Array.isArray(array) ? array : undefined;
};

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

	test('includes a trimmed code and the seedDefaultProfile flag when provided', () => {
		const body = buildCreateStaffTenantBody({
			name: 'Acme Tenant',
			maxUsers: 5,
			code: '  acme-corp  ',
			seedDefaultProfile: false,
			initialUsers: [{ email: 'user@example.com', accountLevel: 'Admin' }],
		});

		expect(unwrapUntyped(body.code)).toBe('acme-corp');
		expect(unwrapUntyped(body.seedDefaultProfile)).toBe(false);
	});

	test('omits code and seedDefaultProfile when not provided', () => {
		const body = buildCreateStaffTenantBody({
			name: 'Acme Tenant',
			maxUsers: 5,
			initialUsers: [{ email: 'user@example.com', accountLevel: 'Admin' }],
		});

		expect(body.code).toBeUndefined();
		expect(body.seedDefaultProfile).toBeUndefined();
	});

	test('omits a blank code rather than sending an empty string', () => {
		const body = buildCreateStaffTenantBody({
			name: 'Acme Tenant',
			maxUsers: 5,
			code: '   ',
			initialUsers: [{ email: 'user@example.com', accountLevel: 'Admin' }],
		});

		expect(body.code).toBeUndefined();
	});

	test('trims and wraps the organization profile fields when provided', () => {
		const body = buildCreateStaffTenantBody({
			name: 'Acme Tenant',
			maxUsers: 5,
			initialUsers: [{ email: 'user@example.com', accountLevel: 'Admin' }],
			legalName: ' Acme Tenant Ltd ',
			description: ' A social platform ',
			websiteUrl: ' https://acme.com ',
			billingEmail: ' billing@acme.com ',
			supportEmail: ' support@acme.com ',
			defaultLocale: ' en ',
			timezone: ' Europe/Paris ',
			notes: ' staff-only note ',
		});

		expect(unwrapUntyped(body.legalName)).toBe('Acme Tenant Ltd');
		expect(unwrapUntyped(body.description)).toBe('A social platform');
		expect(unwrapUntyped(body.websiteUrl)).toBe('https://acme.com');
		expect(unwrapUntyped(body.billingEmail)).toBe('billing@acme.com');
		expect(unwrapUntyped(body.supportEmail)).toBe('support@acme.com');
		expect(unwrapUntyped(body.defaultLocale)).toBe('en');
		expect(unwrapUntyped(body.timezone)).toBe('Europe/Paris');
		expect(unwrapUntyped(body.notes)).toBe('staff-only note');
	});

	test('omits the organization profile fields when absent or blank', () => {
		const body = buildCreateStaffTenantBody({
			name: 'Acme Tenant',
			maxUsers: 5,
			initialUsers: [{ email: 'user@example.com', accountLevel: 'Admin' }],
			legalName: '   ',
		});

		expect(body.legalName).toBeUndefined();
		expect(body.description).toBeUndefined();
		expect(body.websiteUrl).toBeUndefined();
		expect(body.billingEmail).toBeUndefined();
		expect(body.supportEmail).toBeUndefined();
		expect(body.defaultLocale).toBeUndefined();
		expect(body.timezone).toBeUndefined();
		expect(body.notes).toBeUndefined();
	});

	test('strips the API origin off a same-origin logoUrl before persisting', () => {
		const body = buildCreateStaffTenantBody({
			name: 'Acme Tenant',
			maxUsers: 5,
			initialUsers: [{ email: 'user@example.com', accountLevel: 'Admin' }],
			logoUrl: `${API_BASE_URL}/files/uploads/2026/07/logo.png`,
		});

		expect(unwrapUntyped(body.logoUrl)).toBe('/files/uploads/2026/07/logo.png');
	});

	test('leaves an externally hosted logoUrl untouched', () => {
		const body = buildCreateStaffTenantBody({
			name: 'Acme Tenant',
			maxUsers: 5,
			initialUsers: [{ email: 'user@example.com', accountLevel: 'Admin' }],
			logoUrl: 'https://cdn.example.com/acme-logo.png',
		});

		expect(unwrapUntyped(body.logoUrl)).toBe(
			'https://cdn.example.com/acme-logo.png',
		);
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

	test('strips the API origin off a same-origin logoUrl before persisting', () => {
		const body = buildUpdateStaffTenantBody({
			logoUrl: `${API_BASE_URL}/files/uploads/2026/07/logo.png`,
		});

		expect(unwrapUntyped(body.logoUrl)).toBe('/files/uploads/2026/07/logo.png');
	});

	test('trims and wraps the organization profile fields when set', () => {
		const body = buildUpdateStaffTenantBody({
			legalName: ' Acme Tenant Ltd ',
			description: ' A social platform ',
			websiteUrl: ' https://acme.com ',
			billingEmail: ' billing@acme.com ',
			supportEmail: ' support@acme.com ',
			defaultLocale: ' en ',
			timezone: ' Europe/Paris ',
			notes: ' staff-only note ',
		});

		expect(unwrapUntyped(body.legalName)).toBe('Acme Tenant Ltd');
		expect(unwrapUntyped(body.description)).toBe('A social platform');
		expect(unwrapUntyped(body.websiteUrl)).toBe('https://acme.com');
		expect(unwrapUntyped(body.billingEmail)).toBe('billing@acme.com');
		expect(unwrapUntyped(body.supportEmail)).toBe('support@acme.com');
		expect(unwrapUntyped(body.defaultLocale)).toBe('en');
		expect(unwrapUntyped(body.timezone)).toBe('Europe/Paris');
		expect(unwrapUntyped(body.notes)).toBe('staff-only note');
	});

	test('sends explicit null for each organization profile field cleared to blank', () => {
		const body = buildUpdateStaffTenantBody({
			legalName: '   ',
			description: '   ',
			websiteUrl: '   ',
			billingEmail: '   ',
			supportEmail: '   ',
			defaultLocale: '   ',
			timezone: '   ',
			notes: '   ',
		});

		expect(body.legalName).toBeNull();
		expect(body.description).toBeNull();
		expect(body.websiteUrl).toBeNull();
		expect(body.billingEmail).toBeNull();
		expect(body.supportEmail).toBeNull();
		expect(body.defaultLocale).toBeNull();
		expect(body.timezone).toBeNull();
		expect(body.notes).toBeNull();
	});

	test('omits the organization profile fields when not provided', () => {
		const body = buildUpdateStaffTenantBody({
			name: 'Acme Tenant',
		});

		expect(body.legalName).toBeUndefined();
		expect(body.description).toBeUndefined();
		expect(body.websiteUrl).toBeUndefined();
		expect(body.billingEmail).toBeUndefined();
		expect(body.supportEmail).toBeUndefined();
		expect(body.defaultLocale).toBeUndefined();
		expect(body.timezone).toBeUndefined();
		expect(body.notes).toBeUndefined();
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
			status: TenantStatusObject.Suspended,
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
			status: TenantStatusObject.Suspended,
		});
	});
});

describe('reactivateStaffTenantMutationOptions', () => {
	test('calls the generated tenant reactivate mutation path', async () => {
		const post = vi.fn().mockResolvedValue({
			tenantId: 'tenant-001',
			name: 'Acme Corporation',
			status: TenantStatusObject.Active,
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
			status: TenantStatusObject.Active,
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

	test('passes a canonical multi-status value through unchanged', () => {
		expect(
			buildFindStaffTenantsQueryParameters({
				status: 'active,suspended',
			}),
		).toEqual({ status: 'active,suspended' });
	});

	test('builds a tenant details query key with a stable prefix', () => {
		expect(STAFF_TENANT_DETAILS_QUERY_KEY).toEqual(['staff-tenants', 'detail']);
	});
});

describe('staffTenantsQueryOptions.queryKey', () => {
	test('keys combined statuses independently', () => {
		expect(
			staffTenantsQueryOptions.queryKey({ status: 'active,suspended' }),
		).toEqual([
			'staff',
			...STAFF_TENANTS_QUERY_KEY,
			{ status: 'active,suspended' },
		]);
	});

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
				logoUrl: '/files/uploads/acme.png',
				status: TenantStatusObject.Active,
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
		];

		expect(toStaffTenantRows(items)).toEqual([
			{
				id: 'tenant-1',
				name: 'Acme Corporation',
				logoUrl: 'https://api.example.test/files/uploads/acme.png',
				status: 'Active',
				usersCount: 12,
				maxUsers: 50,
			},
		]);
	});

	// shell-r5-F3: a row missing its required `name` used to be kept with a
	// `'—'` placeholder a staff admin can't distinguish from real data. It
	// must be dropped instead.
	test('drops a row with a blank/missing name rather than fabricating a placeholder', () => {
		const items: TenantAsStaffListItem[] = [
			{
				id: 'tenant-2',
				name: null,
				status: null,
				usersCount: null,
				maxUsers: null,
			},
			{
				id: 'tenant-3',
				name: '   ',
				status: 'Active',
				usersCount: 0,
				maxUsers: 0,
			},
		];

		expect(toStaffTenantRows(items)).toEqual([]);
	});
});

describe('toStaffTenantDetails', () => {
	test('normalizes a detail payload and preserves optional values', () => {
		const createdAt = new Date('2026-07-01T08:30:00Z');
		const lastActivityAt = new Date('2026-07-05T12:00:00Z');

		const result = toStaffTenantDetails({
			tenantId: 'tenant-7',
			name: ' Acme Corporation ',
			code: ' ACME ',
			status: TenantStatusObject.Active,
			usersCount: 12,
			maxUsers: 50,
			ownersCount: 4,
			pendingInvitationsCount: 3,
			expiringSoonInvitationsCount: 1,
			profilesCount: 6,
			logoUrl: ' https://cdn.example.com/acme.png ',
			legalName: ' Acme Corporation Ltd ',
			description: ' A social media platform ',
			websiteUrl: ' https://acme.com ',
			billingEmail: ' billing@acme.com ',
			supportEmail: ' support@acme.com ',
			defaultLocale: ' en ',
			timezone: ' Europe/Paris ',
			notes: ' internal-only note ',
			lastActivityAt,
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
			ownersCount: 4,
			pendingInvitationsCount: 3,
			expiringSoonInvitationsCount: 1,
			profilesCount: 6,
			logoUrl: 'https://cdn.example.com/acme.png',
			legalName: 'Acme Corporation Ltd',
			description: 'A social media platform',
			websiteUrl: 'https://acme.com',
			billingEmail: 'billing@acme.com',
			supportEmail: 'support@acme.com',
			defaultLocale: 'en',
			timezone: 'Europe/Paris',
			notes: 'internal-only note',
			lastActivityAt,
			createdAt,
			updatedAt: null,
		});
	});

	test('defaults the new detail counts to zero and the organization profile fields to null when the payload omits them', () => {
		const result = toStaffTenantDetails({
			tenantId: 'tenant-8',
			name: 'Acme Corporation',
		} as GetTenantAsStaffResult);

		expect(result).toMatchObject({
			ownersCount: 0,
			pendingInvitationsCount: 0,
			expiringSoonInvitationsCount: 0,
			profilesCount: 0,
			legalName: null,
			description: null,
			websiteUrl: null,
			billingEmail: null,
			supportEmail: null,
			defaultLocale: null,
			timezone: null,
			notes: null,
			lastActivityAt: null,
		});
	});

	test('resolves a root-relative /files/ logoUrl against the API origin', () => {
		const result = toStaffTenantDetails({
			tenantId: 'tenant-9',
			name: 'Acme Corporation',
			logoUrl: '/files/uploads/2026/07/logo.png',
		} as GetTenantAsStaffResult);

		expect(result?.logoUrl).toBe(
			`${API_BASE_URL}/files/uploads/2026/07/logo.png`,
		);
	});

	test('returns null when the payload has no usable tenant id', () => {
		expect(
			toStaffTenantDetails({
				tenantId: ' ',
				name: 'Acme Corporation',
			} as GetTenantAsStaffResult),
		).toBeNull();
	});

	// shell-r5-F3: a payload missing its required `name` used to be treated
	// as present-but-blank, fabricating a `'—'` placeholder. It must be
	// treated the same as "not found" instead.
	test('returns null when the payload has no usable name', () => {
		expect(
			toStaffTenantDetails({
				tenantId: 'tenant-10',
				name: '   ',
			} as GetTenantAsStaffResult),
		).toBeNull();
	});
});

describe('invalidateStaffTenants / invalidateAllStaffTenantScopes', () => {
	test('both invalidate the shared staff-tenants scope prefix', () => {
		const invalidateQueries = vi.fn();
		const queryClient = { invalidateQueries } satisfies Pick<
			QueryClient,
			'invalidateQueries'
		>;

		void invalidateStaffTenants(queryClient);
		void invalidateAllStaffTenantScopes(queryClient);

		expect(invalidateQueries).toHaveBeenCalledTimes(2);
		expect(invalidateQueries).toHaveBeenCalledWith({
			queryKey: ['staff', ...STAFF_TENANTS_QUERY_KEY],
		});
	});
});
