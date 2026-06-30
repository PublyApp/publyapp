import { beforeEach, expect, test, vi } from 'vitest';

import {
	buildAnonymousMutationOptions,
	buildAnonymousQueryOptions,
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
		responseStatusCode: 400,
		title: 'bad request',
	});
	expect(onToast).toHaveBeenCalledTimes(1);
	expect(onToast.mock.calls[0]?.[1]).toMatchObject({ scope: 'tenant' });
	expect(onLogout).not.toHaveBeenCalled();
});
