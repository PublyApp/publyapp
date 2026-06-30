import { beforeEach, expect, test, vi } from 'vitest';

import {
	buildAnonymousMutationOptions,
	buildAnonymousQueryOptions,
	buildAuthQueryOptions,
	buildStaffMutationOptions,
	buildStaffQueryOptions,
	buildTenantMutationOptions,
	buildTenantQueryOptions,
} from './create-hooks';

type FakeClient = {
	scope: 'tenant' | 'staff' | 'anonymous';
	tenantId?: string;
};

type Accessor = {
	getOrCreateClient: (tenantId: string) => FakeClient;
	getOrCreateStaffClient: () => FakeClient;
	getOrCreateAnonymousClient: () => FakeClient;
};

const createAccessor = () => ({
	getOrCreateClient: vi.fn((tenantId: string) => ({
		scope: 'tenant' as const,
		tenantId,
	})),
	getOrCreateStaffClient: vi.fn(() => ({ scope: 'staff' as const })),
	getOrCreateAnonymousClient: vi.fn(() => ({ scope: 'anonymous' as const })),
});

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
			queryKeyFn: (client) => `tenant:${client.scope}`,
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
			mutationKeyFn: (client) => `tenant-mutation:${client.scope}`,
			mutationFn: async (client, vars) =>
				`${client.scope}-${vars.tenantId}-mutate`,
			handlers: {
				resolveTenant: () => 'tenant-fallback',
			},
		},
		createScopeOptions(accessor),
	);

	const value = await options.mutationFn({ limit: 5 } as { limit: number });
	expect(accessor.getOrCreateClient).toHaveBeenCalledWith('tenant-fallback');
	expect(value).toBe('tenant-tenant-fallback-mutate');
});

test('tenant query resolves blank tenantId via handler fallback', async () => {
	const options = buildTenantQueryOptions(
		{
			queryKeyFn: (client) => `tenant:${client.scope}`,
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
	} as { tenantId?: string; limit: number });

	expect(accessor.getOrCreateClient).toHaveBeenCalledWith('tenant-fallback');
	expect(value).toBe('tenant-tenant-fallback-12');
});

test('tenant query key includes tenant and query variables', () => {
	const options = buildTenantQueryOptions(
		{
			queryKeyFn: (client) => `tenant:${client.scope}`,
			fetcher: async (client, vars) => `${client.scope}-${vars.tenantId}-${vars.limit}`,
		},
		createScopeOptions(accessor),
	);

	expect(options.queryKey({ tenantId: 'tenant-1', limit: 10, page: 2 })).toEqual([
		'tenant',
		'tenant:tenant',
		'tenant-1',
		{ limit: 10, page: 2 },
	]);
	expect(options.queryKey({ tenantId: 'tenant-1', limit: 11, page: 2 })).not.toEqual(
		options.queryKey({ tenantId: 'tenant-1', limit: 10, page: 2 }),
	);
});

test('tenant mutation key does not include fallback tenant at build time', () => {
	const options = buildTenantMutationOptions(
		{
			mutationKeyFn: (client) => `tenant-mutation:${client.scope}`,
			mutationFn: async (client, vars) => `${client.scope}-${vars.tenantId}-mutate`,
			handlers: {
				resolveTenant: () => 'tenant-fallback',
			},
		},
		createScopeOptions(accessor),
	);

	expect(options.mutationKey).toEqual(['tenant', 'tenant-mutation:tenant']);
});

test('staff query uses staff client and not tenant/anonymous clients', async () => {
	const options = buildStaffQueryOptions(
		{
			queryKeyFn: (client) => `staff:${client.scope}`,
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
			queryKeyFn: (client) => `staff:${client.scope}`,
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

test('anonymous query uses anonymous client', async () => {
	const options = buildAnonymousQueryOptions(
		{
			queryKeyFn: (client) => `anon:${client.scope}`,
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
			queryKeyFn: (client) => `anon:${client.scope}`,
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
			queryKeyFn: (client) => `tenant:${client.scope}`,
			fetcher: async () => 'unused',
		},
		{
			...createScopeOptions(accessor),
			handlers: { onLogout, onToast },
		},
	);

	await options.onError?.({
		responseStatusCode: 401,
		title: 'unauthorized',
	});
	expect(onLogout).toHaveBeenCalledTimes(1);
	expect(onToast).not.toHaveBeenCalled();
});

test('non-401 errors trigger onToast for tenant scope', async () => {
	const onLogout = vi.fn();
	const onToast = vi.fn();
	const onError = vi.fn();
	const options = buildTenantQueryOptions(
		{
			queryKeyFn: (client) => `tenant:${client.scope}`,
			fetcher: async () => 'unused',
			onError,
		},
		{
			...createScopeOptions(accessor),
			handlers: { onLogout, onToast },
		},
	);

	await options.onError?.({
		responseStatusCode: 400,
		title: 'bad request',
	});
	expect(onError).toHaveBeenCalledTimes(1);
	expect(onToast).toHaveBeenCalledTimes(1);
	expect(onToast.mock.calls[0]?.[1]).toMatchObject({ scope: 'tenant' });
	expect(onLogout).not.toHaveBeenCalled();
});

test('anonymous auth errors do not trigger onLogout for 401', async () => {
	const onLogout = vi.fn();
	const onToast = vi.fn();
	const options = buildAnonymousQueryOptions(
		{
			queryKeyFn: (client) => `anon:${client.scope}`,
			fetcher: async () => 'unused',
		},
		{
			...createScopeOptions(accessor),
			handlers: { onLogout, onToast },
		},
	);

	await options.onError?.({
		responseStatusCode: 401,
		title: 'unauthorized',
	});
	expect(onLogout).not.toHaveBeenCalled();
	expect(onToast).toHaveBeenCalledTimes(1);
});

test('auth query errors follow anonymous-style 401 handling (no onLogout)', async () => {
	const onLogout = vi.fn();
	const onToast = vi.fn();
	const options = buildAuthQueryOptions(
		{
			queryKeyFn: (client) => `auth:${client.scope}`,
			fetcher: async () => 'unused',
		},
		{
			...createScopeOptions(accessor),
			handlers: { onLogout, onToast },
		},
	);

	await options.onError?.({
		responseStatusCode: 401,
		title: 'unauthorized',
	});
	expect(onLogout).not.toHaveBeenCalled();
	expect(onToast).toHaveBeenCalledTimes(1);
});
