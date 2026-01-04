import {
	createMutation,
	createQuery,
	createSuspenseQuery,
} from 'react-query-kit';

import { clientManager } from '@/front/lib/js-client/client-manager';
import type { ApiClient } from '@/js-client/src/apiClient';

import { getQueryKey } from './query-utils';

// Type for tenant-scoped variables (tenantId is required)
// Using object spread to avoid issues with EmptyVariables
type WithTenantId<T> = { tenantId: string } & Omit<T, 'tenantId'>;

// Type for variables that may or may not have tenantId
type MaybeWithTenantId<T> = { tenantId?: string } & Omit<T, 'tenantId'>;

// Common retry logic for auth errors
type RetryFn = (failureCount: number, error: Error) => boolean;

// Empty variables type - use this instead of EmptyVariables
// biome-ignore lint/complexity/noBannedTypes: We need an empty object type here
type EmptyVariables = {};

// ============================================================================
// TENANT-SCOPED FACTORIES
// These require tenantId in variables and include X-PublyApp-TenantId header
// ============================================================================

type TenantQueryConfig<TData, TVariables> = {
	queryKeyFn: (client: ApiClient) => unknown;
	fetcher: (client: ApiClient, variables: TVariables) => Promise<TData>;
	retry?: RetryFn;
};

/**
 * Creates a tenant-scoped query hook.
 * Automatically includes X-PublyApp-TenantId header and enforces tenantId in variables.
 * Session token is read fresh from cookies on every request.
 *
 * @example
 * ```ts
 * export const useFindPosts = createTenantQuery({
 *   queryKeyFn: (client) => client.tenant.posts.get,
 *   fetcher: (client, { page }) => client.tenant.posts.get({ queryParameters: { page } }),
 * });
 *
 * // Usage: tenantId is required
 * const { data } = useFindPosts({ tenantId, page: 1 });
 * ```
 */
export function createTenantQuery<
	TData,
	TVariables extends Record<string, unknown> = EmptyVariables,
>(config: TenantQueryConfig<TData, TVariables>) {
	const queryKey = getQueryKey<ApiClient>(config.queryKeyFn);

	return createQuery<TData, WithTenantId<TVariables>>({
		queryKey: [queryKey] as const,
		fetcher: async (variables) => {
			const { tenantId, ...rest } = variables;
			const client = clientManager.getOrCreateClient(tenantId);
			return config.fetcher(client, rest as unknown as TVariables);
		},
		...(config.retry ? { retry: config.retry } : {}),
	});
}

/**
 * Creates a tenant-scoped suspense query hook.
 * Same as createTenantQuery but uses useSuspenseQuery internally.
 */
export function createTenantSuspenseQuery<
	TData,
	TVariables extends Record<string, unknown> = EmptyVariables,
>(config: TenantQueryConfig<TData, TVariables>) {
	const queryKey = getQueryKey<ApiClient>(config.queryKeyFn);

	return createSuspenseQuery<TData, WithTenantId<TVariables>>({
		queryKey: [queryKey] as const,
		fetcher: async (variables) => {
			const { tenantId, ...rest } = variables;
			const client = clientManager.getOrCreateClient(tenantId);
			return config.fetcher(client, rest as unknown as TVariables);
		},
		...(config.retry ? { retry: config.retry } : {}),
	});
}

type TenantMutationConfig<TData, TVariables> = {
	mutationKeyFn: (client: ApiClient) => unknown;
	mutationFn: (client: ApiClient, variables: TVariables) => Promise<TData>;
};

/**
 * Creates a tenant-scoped mutation hook.
 * Automatically includes X-PublyApp-TenantId header and enforces tenantId in variables.
 */
export function createTenantMutation<
	TData,
	TVariables extends Record<string, unknown> = EmptyVariables,
>(config: TenantMutationConfig<TData, TVariables>) {
	const mutationKey = getQueryKey<ApiClient>(config.mutationKeyFn);

	return createMutation<TData, WithTenantId<TVariables>>({
		mutationKey: [mutationKey] as const,
		mutationFn: async (variables) => {
			const { tenantId, ...rest } = variables;
			const client = clientManager.getOrCreateClient(tenantId);
			return config.mutationFn(client, rest as unknown as TVariables);
		},
	});
}

// ============================================================================
// STAFF FACTORIES
// These don't require tenantId and are for staff-only endpoints
// ============================================================================

type StaffQueryConfig<TData, TVariables> = {
	queryKeyFn: (client: ApiClient) => unknown;
	fetcher: (client: ApiClient, variables: TVariables) => Promise<TData>;
	retry?: RetryFn;
};

/**
 * Creates a staff query hook.
 * Uses the staff client (no tenant-id header).
 * Session token is read fresh from cookies on every request.
 *
 * @example
 * ```ts
 * export const useFindTenants = createStaffQuery({
 *   queryKeyFn: (client) => client.staff.tenants.get,
 *   fetcher: (client, { page }) => client.staff.tenants.get({ queryParameters: { page } }),
 * });
 *
 * // Usage: no tenantId needed
 * const { data } = useFindTenants({ page: 1 });
 * ```
 */
export function createStaffQuery<
	TData,
	TVariables extends Record<string, unknown> = EmptyVariables,
>(config: StaffQueryConfig<TData, TVariables>) {
	const queryKey = getQueryKey<ApiClient>(config.queryKeyFn);

	return createQuery<TData, TVariables>({
		queryKey: [queryKey] as const,
		fetcher: async (variables) => {
			const client = clientManager.getStaffClient();
			return config.fetcher(client, variables);
		},
		...(config.retry ? { retry: config.retry } : {}),
	});
}

/**
 * Creates a staff suspense query hook.
 * Same as createStaffQuery but uses useSuspenseQuery internally.
 */
export function createStaffSuspenseQuery<
	TData,
	TVariables extends Record<string, unknown> = EmptyVariables,
>(config: StaffQueryConfig<TData, TVariables>) {
	const queryKey = getQueryKey<ApiClient>(config.queryKeyFn);

	return createSuspenseQuery<TData, TVariables>({
		queryKey: [queryKey] as const,
		fetcher: async (variables) => {
			const client = clientManager.getStaffClient();
			return config.fetcher(client, variables);
		},
		...(config.retry ? { retry: config.retry } : {}),
	});
}

type StaffMutationConfig<TData, TVariables> = {
	mutationKeyFn: (client: ApiClient) => unknown;
	mutationFn: (client: ApiClient, variables: TVariables) => Promise<TData>;
};

/**
 * Creates a staff mutation hook.
 * Uses the staff client (no tenant-id header).
 */
export function createStaffMutation<
	TData,
	TVariables extends Record<string, unknown> = EmptyVariables,
>(config: StaffMutationConfig<TData, TVariables>) {
	const mutationKey = getQueryKey<ApiClient>(config.mutationKeyFn);

	return createMutation<TData, TVariables>({
		mutationKey: [mutationKey] as const,
		mutationFn: async (variables) => {
			const client = clientManager.getStaffClient();
			return config.mutationFn(client, variables);
		},
	});
}

// ============================================================================
// AUTH FACTORIES
// For auth endpoints that need session token but may or may not need tenantId
// ============================================================================

type AuthQueryConfig<TData, TVariables> = {
	queryKeyFn: (client: ApiClient) => unknown;
	fetcher: (client: ApiClient, variables: TVariables) => Promise<TData>;
	retry?: RetryFn;
};

/**
 * Creates an auth query hook.
 * Uses the staff client (session token, no tenant-id header).
 * For auth endpoints like getUserAuthData, getUserTenants.
 */
export function createAuthQuery<
	TData,
	TVariables extends Record<string, unknown> = EmptyVariables,
>(config: AuthQueryConfig<TData, TVariables>) {
	const queryKey = getQueryKey<ApiClient>(config.queryKeyFn);

	return createQuery<TData, TVariables>({
		queryKey: [queryKey] as const,
		fetcher: async (variables) => {
			const client = clientManager.getStaffClient();
			return config.fetcher(client, variables);
		},
		...(config.retry ? { retry: config.retry } : {}),
	});
}

/**
 * Creates an auth suspense query hook.
 * Same as createAuthQuery but uses useSuspenseQuery internally.
 */
export function createAuthSuspenseQuery<
	TData,
	TVariables extends Record<string, unknown> = EmptyVariables,
>(config: AuthQueryConfig<TData, TVariables>) {
	const queryKey = getQueryKey<ApiClient>(config.queryKeyFn);

	return createSuspenseQuery<TData, TVariables>({
		queryKey: [queryKey] as const,
		fetcher: async (variables) => {
			const client = clientManager.getStaffClient();
			return config.fetcher(client, variables);
		},
		...(config.retry ? { retry: config.retry } : {}),
	});
}

type AuthMutationConfig<TData, TVariables> = {
	mutationKeyFn: (client: ApiClient) => unknown;
	mutationFn: (client: ApiClient, variables: TVariables) => Promise<TData>;
};

/**
 * Creates an auth mutation hook.
 * Uses the staff client (session token, no tenant-id header).
 */
export function createAuthMutation<
	TData,
	TVariables extends Record<string, unknown> = EmptyVariables,
>(config: AuthMutationConfig<TData, TVariables>) {
	const mutationKey = getQueryKey<ApiClient>(config.mutationKeyFn);

	return createMutation<TData, TVariables>({
		mutationKey: [mutationKey] as const,
		mutationFn: async (variables) => {
			const client = clientManager.getStaffClient();
			return config.mutationFn(client, variables);
		},
	});
}

// ============================================================================
// PUBLIC/ANONYMOUS FACTORIES
// For endpoints that don't require authentication
// ============================================================================

type PublicQueryConfig<TData, TVariables> = {
	queryKeyFn: (client: ApiClient) => unknown;
	fetcher: (client: ApiClient, variables: TVariables) => Promise<TData>;
	retry?: RetryFn;
};

/**
 * Creates a public query hook.
 * Uses the anonymous client (no session token, no tenant-id header).
 * For public endpoints that don't require authentication.
 */
export function createPublicQuery<
	TData,
	TVariables extends Record<string, unknown> = EmptyVariables,
>(config: PublicQueryConfig<TData, TVariables>) {
	const queryKey = getQueryKey<ApiClient>(config.queryKeyFn);

	return createQuery<TData, TVariables>({
		queryKey: [queryKey] as const,
		fetcher: async (variables) => {
			return config.fetcher(clientManager.anonymousClient, variables);
		},
		...(config.retry ? { retry: config.retry } : {}),
	});
}

/**
 * Creates a public suspense query hook.
 * Same as createPublicQuery but uses useSuspenseQuery internally.
 */
export function createPublicSuspenseQuery<
	TData,
	TVariables extends Record<string, unknown> = EmptyVariables,
>(config: PublicQueryConfig<TData, TVariables>) {
	const queryKey = getQueryKey<ApiClient>(config.queryKeyFn);

	return createSuspenseQuery<TData, TVariables>({
		queryKey: [queryKey] as const,
		fetcher: async (variables) => {
			return config.fetcher(clientManager.anonymousClient, variables);
		},
		...(config.retry ? { retry: config.retry } : {}),
	});
}

type PublicMutationConfig<TData, TVariables> = {
	mutationKeyFn: (client: ApiClient) => unknown;
	mutationFn: (client: ApiClient, variables: TVariables) => Promise<TData>;
};

/**
 * Creates a public mutation hook.
 * Uses the anonymous client (no session token, no tenant-id header).
 */
export function createPublicMutation<
	TData,
	TVariables extends Record<string, unknown> = EmptyVariables,
>(config: PublicMutationConfig<TData, TVariables>) {
	const mutationKey = getQueryKey<ApiClient>(config.mutationKeyFn);

	return createMutation<TData, TVariables>({
		mutationKey: [mutationKey] as const,
		mutationFn: async (variables) => {
			return config.mutationFn(clientManager.anonymousClient, variables);
		},
	});
}

// Re-export types for use in hook files
export type { WithTenantId, MaybeWithTenantId, RetryFn };
