import { beforeEach, expect, test, vi } from 'vitest';

import {
	buildAnonymousQueryOptions,
	buildAuthQueryOptions,
	buildStaffMutationOptions,
	buildStaffQueryOptions,
	buildTenantMutationOptions,
	buildTenantQueryOptions,
	scopedKey,
} from './create-hooks';

type FakeClient = {
	scope: 'tenant' | 'staff' | 'anonymous';
	tenantId?: string;
};

type Accessor = {
	getOrCreateClient: (tenantId: string) => FakeClient;
	getOrCreateStaffClient: () => FakeClient;
	getOrCreateTenantScopeClient: () => FakeClient;
	getOrCreateAnonymousClient: () => FakeClient;
};

const createAccessor = () => ({
	getOrCreateClient: vi.fn((tenantId: string) => ({
		scope: 'tenant' as const,
		tenantId,
	})),
	getOrCreateStaffClient: vi.fn(() => ({ scope: 'staff' as const })),
	getOrCreateTenantScopeClient: vi.fn(() => ({ scope: 'tenant' as const })),
	getOrCreateAnonymousClient: vi.fn(() => ({ scope: 'anonymous' as const })),
});

// The generated `onError` forwards any thrown value to `toApiFailure(unknown)`,
// but the factories type the callback `TError` (default `Error`). Build real
// `Error` instances carrying the problem-details fields so the payloads
// type-check without casts while `toApiFailure` still sees `responseStatusCode`
// at runtime.
const problemError = (responseStatusCode: number, title: string): Error =>
	Object.assign(new Error(title), { responseStatusCode, title });

const createScopeOptions = (accessor: Accessor) => ({
	clientAccessor: accessor,
});

let accessor: ReturnType<typeof createAccessor>;

beforeEach(() => {
	accessor = createAccessor();
});

test('tenant query resolves tenantId from variables and uses tenant client', async () => {
	const options = buildTenantQueryOptions(
		{
			queryKeyFn: () => ['tenant:tenant'],
			fetcher: async (client, vars) =>
				`${client.scope}-${vars.tenantId}-${vars.limit}`,
		},
		createScopeOptions(accessor),
	);

	const value = await options.fetcher({
		tenantId: 'tenant-1',
		limit: 10,
	});
	expect(accessor.getOrCreateClient).toHaveBeenCalledWith('tenant-1');
	expect(accessor.getOrCreateStaffClient).not.toHaveBeenCalled();
	expect(accessor.getOrCreateAnonymousClient).not.toHaveBeenCalled();
	expect(value).toBe('tenant-tenant-1-10');
});

test('tenant mutation resolves tenantId from handler fallback when variable is absent', async () => {
	const options = buildTenantMutationOptions(
		{
			mutationKeyFn: () => ['tenant-mutation:tenant'],
			mutationFn: async (client, vars) =>
				`${client.scope}-${vars.tenantId}-mutate`,
			meta: { silentSuccess: true },
			handlers: {
				resolveTenant: () => 'tenant-fallback',
			},
		},
		createScopeOptions(accessor),
	);

	const value = await options.mutationFn({ limit: 5 } satisfies {
		limit: number;
	});
	expect(accessor.getOrCreateClient).toHaveBeenCalledWith('tenant-fallback');
	expect(value).toBe('tenant-tenant-fallback-mutate');
});

test('tenant query resolves blank tenantId via handler fallback', async () => {
	const options = buildTenantQueryOptions(
		{
			queryKeyFn: () => ['tenant:tenant'],
			fetcher: async (client, vars) =>
				`${client.scope}-${vars.tenantId}-${vars.limit}`,
			handlers: {
				resolveTenant: () => ' tenant-fallback ',
			},
		},
		createScopeOptions(accessor),
	);

	const value = await options.fetcher({
		tenantId: '   ',
		limit: 12,
	} satisfies { tenantId?: string; limit: number });

	expect(accessor.getOrCreateClient).toHaveBeenCalledWith('tenant-fallback');
	expect(value).toBe('tenant-tenant-fallback-12');
});

test('tenant query key includes tenant and query variables', () => {
	const options = buildTenantQueryOptions(
		{
			queryKeyFn: () => ['tenant:tenant'],
			fetcher: async (client, vars) =>
				`${client.scope}-${vars.tenantId}-${vars.limit}`,
		},
		createScopeOptions(accessor),
	);

	expect(
		options.queryKey({ tenantId: 'tenant-1', limit: 10, page: 2 }),
	).toEqual(['tenant', 'tenant:tenant', 'tenant-1', { limit: 10, page: 2 }]);
	expect(
		options.queryKey({ tenantId: 'tenant-1', limit: 11, page: 2 }),
	).not.toEqual(options.queryKey({ tenantId: 'tenant-1', limit: 10, page: 2 }));
});

test('tenant query key sorts query variable keys consistently', () => {
	const options = buildTenantQueryOptions(
		{
			queryKeyFn: () => ['tenant:tenant'],
			fetcher: async (client, vars) =>
				`${client.scope}-${vars.tenantId}-${vars.limit}-${vars.page}`,
		},
		createScopeOptions(accessor),
	);

	expect(
		options.queryKey({
			tenantId: 'tenant-1',
			page: 2,
			limit: 10,
		} satisfies { tenantId: string; page: number; limit: number }),
	).toEqual(['tenant', 'tenant:tenant', 'tenant-1', { limit: 10, page: 2 }]);
});

test('tenant mutation key does not include fallback tenant at build time', () => {
	const options = buildTenantMutationOptions(
		{
			mutationKeyFn: () => ['tenant-mutation:tenant'],
			mutationFn: async (client, vars) =>
				`${client.scope}-${vars.tenantId}-mutate`,
			meta: { silentSuccess: true },
			handlers: {
				resolveTenant: () => 'tenant-fallback',
			},
		},
		createScopeOptions(accessor),
	);

	expect(options.mutationKey).toEqual(['tenant', 'tenant-mutation:tenant']);
});

test('tenant query key throws when tenantId is not resolvable', () => {
	const options = buildTenantQueryOptions(
		{
			queryKeyFn: () => ['tenant:tenant'],
			fetcher: async (client, vars) => `${client.scope}-${vars.tenantId}-fetch`,
		},
		createScopeOptions(accessor),
	);

	expect(() => options.queryKey({} satisfies { tenantId?: string })).toThrow(
		'tenantId is required to create tenant-scoped client',
	);
});

test('staff query uses staff client and not tenant/anonymous clients', async () => {
	const options = buildStaffQueryOptions(
		{
			queryKeyFn: () => ['staff:staff'],
			fetcher: async (client) => client.scope,
		},
		createScopeOptions(accessor),
	);

	const value = await options.fetcher({ page: 1 });
	expect(accessor.getOrCreateStaffClient).toHaveBeenCalledTimes(1);
	expect(accessor.getOrCreateClient).not.toHaveBeenCalled();
	expect(accessor.getOrCreateAnonymousClient).not.toHaveBeenCalled();
	expect(value).toBe('staff');
});

test('staff query key includes variables for cache separation', () => {
	const options = buildStaffQueryOptions(
		{
			queryKeyFn: () => ['staff:staff'],
			fetcher: async (client) => client.scope,
		},
		createScopeOptions(accessor),
	);

	expect(options.queryKey({ page: 1 })).toEqual([
		'staff',
		'staff:staff',
		{ page: 1 },
	]);
});

test('staff query key does not include empty variables object', () => {
	const options = buildStaffQueryOptions(
		{
			queryKeyFn: () => ['staff:staff'],
			fetcher: async (client) => client.scope,
		},
		createScopeOptions(accessor),
	);

	expect(options.queryKey({} satisfies { page?: number })).toEqual([
		'staff',
		'staff:staff',
	]);
});

test('anonymous query uses anonymous client', async () => {
	const options = buildAnonymousQueryOptions(
		{
			queryKeyFn: () => ['anon:anonymous'],
			fetcher: async (client) => client.scope,
		},
		createScopeOptions(accessor),
	);

	const value = await options.fetcher({ page: 1 });
	expect(accessor.getOrCreateAnonymousClient).toHaveBeenCalledTimes(1);
	expect(accessor.getOrCreateClient).not.toHaveBeenCalled();
	expect(accessor.getOrCreateStaffClient).not.toHaveBeenCalled();
	expect(value).toBe('anonymous');
});

test('anonymous query key includes variables for cache separation', () => {
	const options = buildAnonymousQueryOptions(
		{
			queryKeyFn: () => ['anon:anonymous'],
			fetcher: async (client) => client.scope,
		},
		createScopeOptions(accessor),
	);

	expect(options.queryKey({ page: 1 })).toEqual([
		'anonymous',
		'anon:anonymous',
		{ page: 1 },
	]);
});

test('tenant onError triggers onLogout for 401 and skips toast', async () => {
	const onLogout = vi.fn();
	const onToast = vi.fn();
	const options = buildTenantQueryOptions(
		{
			queryKeyFn: () => ['tenant:tenant'],
			fetcher: async () => 'unused',
		},
		{
			...createScopeOptions(accessor),
			handlers: { onLogout, onToast },
		},
	);

	await options.onError?.(problemError(401, 'unauthorized'));
	expect(onLogout).toHaveBeenCalledTimes(1);
	expect(onToast).not.toHaveBeenCalled();
});

test('non-401 errors trigger onToast for tenant scope', async () => {
	const onLogout = vi.fn();
	const onToast = vi.fn();
	const onError = vi.fn();
	const options = buildTenantQueryOptions(
		{
			queryKeyFn: () => ['tenant:tenant'],
			fetcher: async () => 'unused',
			onError,
		},
		{
			...createScopeOptions(accessor),
			handlers: { onLogout, onToast },
		},
	);

	await options.onError?.(problemError(400, 'bad request'));
	expect(onError).toHaveBeenCalledTimes(1);
	expect(onToast).toHaveBeenCalledTimes(1);
	expect(onToast.mock.calls[0]?.[1]).toMatchObject({ scope: 'tenant' });
	expect(onLogout).not.toHaveBeenCalled();
});

test('local onError is called even when generated handler throws', () => {
	const onError = vi.fn();
	const options = buildTenantQueryOptions(
		{
			queryKeyFn: () => ['tenant:tenant'],
			fetcher: async () => 'unused',
			onError,
		},
		{
			...createScopeOptions(accessor),
			handlers: {
				onToast: () => {
					throw new Error('toast failed');
				},
			},
		},
	);

	expect(() => options.onError?.(problemError(400, 'bad request'))).toThrow(
		'toast failed',
	);
	expect(onError).toHaveBeenCalledTimes(1);
});

test('anonymous auth errors do not trigger onLogout for 401', async () => {
	const onLogout = vi.fn();
	const onToast = vi.fn();
	const options = buildAnonymousQueryOptions(
		{
			queryKeyFn: () => ['anon:anonymous'],
			fetcher: async () => 'unused',
		},
		{
			...createScopeOptions(accessor),
			handlers: { onLogout, onToast },
		},
	);

	await options.onError?.(problemError(401, 'unauthorized'));
	expect(onLogout).not.toHaveBeenCalled();
	expect(onToast).toHaveBeenCalledTimes(1);
});

test('scopedKey prepends the scope prefix a query factory produces', () => {
	expect(scopedKey('staff', ['staff-tenants'])).toEqual([
		'staff',
		'staff-tenants',
	]);
	expect(scopedKey('tenant', ['tenant:tenant'])).toEqual([
		'tenant',
		'tenant:tenant',
	]);
});

test('auth query errors follow anonymous-style 401 handling (no onLogout)', async () => {
	const onLogout = vi.fn();
	const onToast = vi.fn();
	const options = buildAuthQueryOptions(
		{
			queryKeyFn: () => ['auth:anonymous'],
			fetcher: async () => 'unused',
		},
		{
			...createScopeOptions(accessor),
			handlers: { onLogout, onToast },
		},
	);

	await options.onError?.(problemError(401, 'unauthorized'));
	expect(onLogout).not.toHaveBeenCalled();
	expect(onToast).toHaveBeenCalledTimes(1);
});

test('staff mutation preserves explicit feedback metadata', () => {
	const options = buildStaffMutationOptions(
		{
			mutationKeyFn: () => ['staff-mutation:staff'],
			mutationFn: async (client) => client.scope,
			meta: { successMessage: 'staff-user-updated-success' },
		},
		createScopeOptions(accessor),
	);

	expect(options.meta).toEqual({
		successMessage: 'staff-user-updated-success',
	});
});

test('staff mutation requires feedback metadata', () => {
	buildStaffMutationOptions(
		// @ts-expect-error Mutation factories require explicit feedback metadata.
		{
			mutationKeyFn: () => ['staff-mutation:staff'],
			mutationFn: async (client) => client.scope,
		},
		createScopeOptions(accessor),
	);
});
