import {
	type CreateMutationOptions,
	type CreateQueryOptions,
	type CreateSuspenseQueryOptions,
	createMutation,
	createQuery,
	createSuspenseQuery,
} from 'react-query-kit';

import type { ApiClient } from '@org/client-ts/src/apiClient';

import { getClientManager } from '#app/lib/js-client/client-manager.ts';

import { getQueryKey } from './query-utils';

// Type for tenant-scoped variables (tenantId is required)
// Using object spread to avoid issues with EmptyVariables
type WithTenantId<T> = { tenantId: string } & Omit<T, 'tenantId'>;

// Type for variables that may or may not have tenantId
type MaybeWithTenantId<T> = { tenantId?: string } & Omit<T, 'tenantId'>;

// Empty variables type - use this instead of EmptyVariables
// biome-ignore lint/complexity/noBannedTypes: We need an empty object type here
type EmptyVariables = {};

// Base query options we accept (from react-query-kit's CreateQueryOptions)
// Omit fields we handle ourselves: queryKey, fetcher
// Omit query callbacks to match React Query v5 (no per-query onSuccess/onError/onSettled).
type BaseQueryOptions<TData, TVariables, TError = Error> = Omit<
	CreateQueryOptions<TData, TVariables, TError>,
	'queryKey' | 'fetcher' | 'onSuccess' | 'onError' | 'onSettled'
>;

// Base suspense query options (from react-query-kit's CreateSuspenseQueryOptions)
type BaseSuspenseQueryOptions<TData, TVariables, TError = Error> = Omit<
	CreateSuspenseQueryOptions<TData, TVariables, TError>,
	'queryKey' | 'fetcher' | 'onSuccess' | 'onError' | 'onSettled'
>;

// Base mutation options (from react-query-kit's CreateMutationOptions)
// Omit fields we handle ourselves: mutationKey, mutationFn
type BaseMutationOptions<TData, TVariables, TError = Error> = Omit<
	CreateMutationOptions<TData, TVariables, TError>,
	'mutationKey' | 'mutationFn'
>;

// For tenant-scoped factories, we omit fields that reference TVariables since the type
// gets transformed from TVariables to WithTenantId<TVariables>, causing type incompatibility.
// 'use' middleware, 'variables' default, and callbacks are affected.
type TenantBaseQueryOptions<TData, TVariables, TError = Error> = Omit<
	BaseQueryOptions<TData, TVariables, TError>,
	'use' | 'variables'
>;

type TenantBaseSuspenseQueryOptions<TData, TVariables, TError = Error> = Omit<
	BaseSuspenseQueryOptions<TData, TVariables, TError>,
	'use' | 'variables'
>;

type TenantBaseMutationOptions<TData, TVariables, TError = Error> = Omit<
	BaseMutationOptions<TData, TVariables, TError>,
	'use' | 'onError' | 'onSuccess' | 'onSettled' | 'onMutate'
>;

// ============================================================================
// TENANT-SCOPED FACTORIES
// These require tenantId in variables and include X-PublyApp-TenantId header
// ============================================================================

type TenantQueryConfig<TData, TVariables, TError = Error> = {
	queryKeyFn: (client: ApiClient) => unknown;
	fetcher: (
		client: ApiClient,
		variables: WithTenantId<TVariables>,
	) => Promise<TData>;
} & TenantBaseQueryOptions<TData, TVariables, TError>;

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
 *   staleTime: 5 * 60 * 1000, // 5 minutes
 * });
 *
 * // Usage: tenantId is required
 * const { data } = useFindPosts({ tenantId, page: 1 });
 * ```
 */
export function createTenantQuery<
	TData,
	TVariables extends Record<string, unknown> = EmptyVariables,
	TError = Error,
>(config: TenantQueryConfig<TData, TVariables, TError>) {
	const { queryKeyFn, fetcher, ...restOptions } = config;
	const queryKey = getQueryKey<ApiClient>(queryKeyFn);

	return createQuery<TData, WithTenantId<TVariables>, TError>({
		queryKey: [queryKey] as const,
		fetcher: async (variables) => {
			const client = getClientManager().getOrCreateClient(variables.tenantId);
			return fetcher(client, variables);
		},
		...restOptions,
	});
}

// Suspense variant config type
type TenantSuspenseQueryConfig<TData, TVariables, TError = Error> = {
	queryKeyFn: (client: ApiClient) => unknown;
	fetcher: (
		client: ApiClient,
		variables: WithTenantId<TVariables>,
	) => Promise<TData>;
} & TenantBaseSuspenseQueryOptions<TData, TVariables, TError>;

/**
 * Creates a tenant-scoped suspense query hook.
 * Same as createTenantQuery but uses useSuspenseQuery internally.
 */
export function createTenantSuspenseQuery<
	TData,
	TVariables extends Record<string, unknown> = EmptyVariables,
	TError = Error,
>(config: TenantSuspenseQueryConfig<TData, TVariables, TError>) {
	const { queryKeyFn, fetcher, ...restOptions } = config;
	const queryKey = getQueryKey<ApiClient>(queryKeyFn);

	return createSuspenseQuery<TData, WithTenantId<TVariables>, TError>({
		queryKey: [queryKey] as const,
		fetcher: async (variables) => {
			const client = getClientManager().getOrCreateClient(variables.tenantId);
			return fetcher(client, variables);
		},
		...restOptions,
	});
}

type TenantMutationConfig<TData, TVariables, TError = Error> = {
	mutationKeyFn: (client: ApiClient) => unknown;
	mutationFn: (
		client: ApiClient,
		variables: WithTenantId<TVariables>,
	) => Promise<TData>;
} & TenantBaseMutationOptions<TData, TVariables, TError>;

/**
 * Creates a tenant-scoped mutation hook.
 * Automatically includes X-PublyApp-TenantId header and enforces tenantId in variables.
 */
export function createTenantMutation<
	TData,
	TVariables extends Record<string, unknown> = EmptyVariables,
	TError = Error,
>(config: TenantMutationConfig<TData, TVariables, TError>) {
	const { mutationKeyFn, mutationFn, ...restOptions } = config;
	const mutationKey = getQueryKey<ApiClient>(mutationKeyFn);

	return createMutation<TData, WithTenantId<TVariables>, TError>({
		mutationKey: [mutationKey] as const,
		mutationFn: async (variables) => {
			const client = getClientManager().getOrCreateClient(variables.tenantId);
			return mutationFn(client, variables);
		},
		...restOptions,
	});
}

// ============================================================================
// STAFF FACTORIES
// These don't require tenantId and are for staff-only endpoints
// ============================================================================

type StaffQueryConfig<TData, TVariables, TError = Error> = {
	queryKeyFn: (client: ApiClient) => unknown;
	fetcher: (client: ApiClient, variables: TVariables) => Promise<TData>;
} & BaseQueryOptions<TData, TVariables, TError>;

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
 *   staleTime: 5 * 60 * 1000, // 5 minutes
 * });
 *
 * // Usage: no tenantId needed
 * const { data } = useFindTenants({ page: 1 });
 * ```
 */
export function createStaffQuery<
	TData,
	TVariables extends Record<string, unknown> = EmptyVariables,
	TError = Error,
>(config: StaffQueryConfig<TData, TVariables, TError>) {
	const { queryKeyFn, fetcher, ...restOptions } = config;
	const queryKey = getQueryKey<ApiClient>(queryKeyFn);

	return createQuery<TData, TVariables, TError>({
		queryKey: [queryKey] as const,
		fetcher: async (variables) => {
			const client = getClientManager().getOrCreateStaffClient();
			return fetcher(client, variables);
		},
		...restOptions,
	});
}

type StaffSuspenseQueryConfig<TData, TVariables, TError = Error> = {
	queryKeyFn: (client: ApiClient) => unknown;
	fetcher: (client: ApiClient, variables: TVariables) => Promise<TData>;
} & BaseSuspenseQueryOptions<TData, TVariables, TError>;

/**
 * Creates a staff suspense query hook.
 * Same as createStaffQuery but uses useSuspenseQuery internally.
 */
export function createStaffSuspenseQuery<
	TData,
	TVariables extends Record<string, unknown> = EmptyVariables,
	TError = Error,
>(config: StaffSuspenseQueryConfig<TData, TVariables, TError>) {
	const { queryKeyFn, fetcher, ...restOptions } = config;
	const queryKey = getQueryKey<ApiClient>(queryKeyFn);

	return createSuspenseQuery<TData, TVariables, TError>({
		queryKey: [queryKey] as const,
		fetcher: async (variables) => {
			const client = getClientManager().getOrCreateStaffClient();
			return fetcher(client, variables);
		},
		...restOptions,
	});
}

type StaffMutationConfig<TData, TVariables, TError = Error> = {
	mutationKeyFn: (client: ApiClient) => unknown;
	mutationFn: (client: ApiClient, variables: TVariables) => Promise<TData>;
} & BaseMutationOptions<TData, TVariables, TError>;

/**
 * Creates a staff mutation hook.
 * Uses the staff client (no tenant-id header).
 */
export function createStaffMutation<
	TData,
	TVariables extends Record<string, unknown> = EmptyVariables,
	TError = Error,
>(config: StaffMutationConfig<TData, TVariables, TError>) {
	const { mutationKeyFn, mutationFn, ...restOptions } = config;
	const mutationKey = getQueryKey<ApiClient>(mutationKeyFn);

	return createMutation<TData, TVariables, TError>({
		mutationKey: [mutationKey] as const,
		mutationFn: async (variables) => {
			const client = getClientManager().getOrCreateStaffClient();
			return mutationFn(client, variables);
		},
		...restOptions,
	});
}

// ============================================================================
// AUTH FACTORIES
// For auth endpoints that need session token but may or may not need tenantId
// ============================================================================

type AuthQueryConfig<TData, TVariables, TError = Error> = {
	queryKeyFn: (client: ApiClient) => unknown;
	fetcher: (client: ApiClient, variables: TVariables) => Promise<TData>;
} & BaseQueryOptions<TData, TVariables, TError>;

/**
 * Creates an auth query hook.
 * Uses the staff client (session token, no tenant-id header).
 * For auth endpoints like getUserAuthData, getUserTenants.
 */
export function createAuthQuery<
	TData,
	TVariables extends Record<string, unknown> = EmptyVariables,
	TError = Error,
>(config: AuthQueryConfig<TData, TVariables, TError>) {
	const { queryKeyFn, fetcher, ...restOptions } = config;
	const queryKey = getQueryKey<ApiClient>(queryKeyFn);

	return createQuery<TData, TVariables, TError>({
		queryKey: [queryKey] as const,
		fetcher: async (variables) => {
			const client = getClientManager().getOrCreateStaffClient();
			return fetcher(client, variables);
		},
		...restOptions,
	});
}

type AuthSuspenseQueryConfig<TData, TVariables, TError = Error> = {
	queryKeyFn: (client: ApiClient) => unknown;
	fetcher: (client: ApiClient, variables: TVariables) => Promise<TData>;
} & BaseSuspenseQueryOptions<TData, TVariables, TError>;

/**
 * Creates an auth suspense query hook.
 * Same as createAuthQuery but uses useSuspenseQuery internally.
 */
export function createAuthSuspenseQuery<
	TData,
	TVariables extends Record<string, unknown> = EmptyVariables,
	TError = Error,
>(config: AuthSuspenseQueryConfig<TData, TVariables, TError>) {
	const { queryKeyFn, fetcher, ...restOptions } = config;
	const queryKey = getQueryKey<ApiClient>(queryKeyFn);

	return createSuspenseQuery<TData, TVariables, TError>({
		queryKey: [queryKey] as const,
		fetcher: async (variables) => {
			const client = getClientManager().getOrCreateStaffClient();
			return fetcher(client, variables);
		},
		...restOptions,
	});
}

type AuthMutationConfig<TData, TVariables, TError = Error> = {
	mutationKeyFn: (client: ApiClient) => unknown;
	mutationFn: (client: ApiClient, variables: TVariables) => Promise<TData>;
} & BaseMutationOptions<TData, TVariables, TError>;

/**
 * Creates an auth mutation hook.
 * Uses the staff client (session token, no tenant-id header).
 */
export function createAuthMutation<
	TData,
	TVariables extends Record<string, unknown> = EmptyVariables,
	TError = Error,
>(config: AuthMutationConfig<TData, TVariables, TError>) {
	const { mutationKeyFn, mutationFn, ...restOptions } = config;
	const mutationKey = getQueryKey<ApiClient>(mutationKeyFn);

	return createMutation<TData, TVariables, TError>({
		mutationKey: [mutationKey] as const,
		mutationFn: async (variables) => {
			const client = getClientManager().getOrCreateStaffClient();
			return mutationFn(client, variables);
		},
		...restOptions,
	});
}

// ============================================================================
// PUBLIC/ANONYMOUS FACTORIES
// For endpoints that don't require authentication
// ============================================================================

type PublicQueryConfig<TData, TVariables, TError = Error> = {
	queryKeyFn: (client: ApiClient) => unknown;
	fetcher: (client: ApiClient, variables: TVariables) => Promise<TData>;
} & BaseQueryOptions<TData, TVariables, TError>;

/**
 * Creates a public query hook.
 * Uses the anonymous client (no session token, no tenant-id header).
 * For public endpoints that don't require authentication.
 */
export function createPublicQuery<
	TData,
	TVariables extends Record<string, unknown> = EmptyVariables,
	TError = Error,
>(config: PublicQueryConfig<TData, TVariables, TError>) {
	const { queryKeyFn, fetcher, ...restOptions } = config;
	const queryKey = getQueryKey<ApiClient>(queryKeyFn);

	return createQuery<TData, TVariables, TError>({
		queryKey: [queryKey] as const,
		fetcher: async (variables) => {
			return fetcher(
				getClientManager().getOrCreateAnonymousClient(),
				variables,
			);
		},
		...restOptions,
	});
}

type PublicSuspenseQueryConfig<TData, TVariables, TError = Error> = {
	queryKeyFn: (client: ApiClient) => unknown;
	fetcher: (client: ApiClient, variables: TVariables) => Promise<TData>;
} & BaseSuspenseQueryOptions<TData, TVariables, TError>;

/**
 * Creates a public suspense query hook.
 * Same as createPublicQuery but uses useSuspenseQuery internally.
 */
export function createPublicSuspenseQuery<
	TData,
	TVariables extends Record<string, unknown> = EmptyVariables,
	TError = Error,
>(config: PublicSuspenseQueryConfig<TData, TVariables, TError>) {
	const { queryKeyFn, fetcher, ...restOptions } = config;
	const queryKey = getQueryKey<ApiClient>(queryKeyFn);

	return createSuspenseQuery<TData, TVariables, TError>({
		queryKey: [queryKey] as const,
		fetcher: async (variables) => {
			return fetcher(
				getClientManager().getOrCreateAnonymousClient(),
				variables,
			);
		},
		...restOptions,
	});
}

type PublicMutationConfig<TData, TVariables, TError = Error> = {
	mutationKeyFn: (client: ApiClient) => unknown;
	mutationFn: (client: ApiClient, variables: TVariables) => Promise<TData>;
} & BaseMutationOptions<TData, TVariables, TError>;

/**
 * Creates a public mutation hook.
 * Uses the anonymous client (no session token, no tenant-id header).
 */
export function createPublicMutation<
	TData,
	TVariables extends Record<string, unknown> = EmptyVariables,
	TError = Error,
>(config: PublicMutationConfig<TData, TVariables, TError>) {
	const { mutationKeyFn, mutationFn, ...restOptions } = config;
	const mutationKey = getQueryKey<ApiClient>(mutationKeyFn);

	return createMutation<TData, TVariables, TError>({
		mutationKey: [mutationKey] as const,
		mutationFn: async (variables) => {
			return mutationFn(
				getClientManager().getOrCreateAnonymousClient(),
				variables,
			);
		},
		...restOptions,
	});
}

// Re-export types for use in hook files
export type { MaybeWithTenantId, WithTenantId };
