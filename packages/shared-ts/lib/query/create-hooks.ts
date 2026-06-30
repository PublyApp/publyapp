import type {
	CreateMutationOptions,
	CreateQueryOptions,
	CreateSuspenseQueryOptions,
} from 'react-query-kit';
import {
	createMutation,
	createQuery,
	createSuspenseQuery,
} from 'react-query-kit';

import { toApiFailure } from '../api-failure/to-api-failure';
import { getQueryKey } from './keys';
import type {
	ClientAccessor,
	QueryErrorHandlers,
	QueryFactoryOptions,
} from './types';

type QueryScope = 'tenant' | 'staff' | 'anonymous' | 'auth';

type EmptyVariables = {};
type TenantQueryVariables<TVariables> = { tenantId?: string } & Omit<
	TVariables,
	'tenantId'
>;
type TenantQueryVariablesRequired<TVariables> = { tenantId: string } & Omit<
	TVariables,
	'tenantId'
>;

type BaseQueryOptions<TData, TVariables, TError = Error> = Omit<
	CreateQueryOptions<TData, TVariables, TError>,
	'queryKey' | 'fetcher' | 'onSuccess' | 'onError' | 'onSettled'
>;

type BaseSuspenseQueryOptions<TData, TVariables, TError = Error> = Omit<
	CreateSuspenseQueryOptions<TData, TVariables, TError>,
	'queryKey' | 'fetcher' | 'onSuccess' | 'onError' | 'onSettled'
>;

type BaseMutationOptions<TData, TVariables, TError = Error> = Omit<
	CreateMutationOptions<TData, TVariables, TError>,
	'mutationKey' | 'mutationFn'
>;

type TenantQueryConfig<
	TApiClient,
	TData,
	TVariables extends Record<string, unknown>,
	TError = Error,
> = {
	queryKeyFn: (client: TApiClient) => unknown;
	fetcher: (
		client: TApiClient,
		variables: TenantQueryVariablesRequired<TVariables>,
	) => Promise<TData>;
	handlers?: QueryErrorHandlers;
} & Omit<
	BaseQueryOptions<TData, TenantQueryVariables<TVariables>, TError>,
	'use' | 'variables'
>;

type TenantSuspenseQueryConfig<
	TApiClient,
	TData,
	TVariables extends Record<string, unknown>,
	TError = Error,
> = {
	queryKeyFn: (client: TApiClient) => unknown;
	fetcher: (
		client: TApiClient,
		variables: TenantQueryVariablesRequired<TVariables>,
	) => Promise<TData>;
	handlers?: QueryErrorHandlers;
} & Omit<
	BaseSuspenseQueryOptions<TData, TenantQueryVariables<TVariables>, TError>,
	'use' | 'variables'
>;

type TenantMutationConfig<
	TApiClient,
	TData,
	TVariables extends Record<string, unknown>,
	TError = Error,
> = {
	mutationKeyFn: (client: TApiClient) => unknown;
	mutationFn: (
		client: TApiClient,
		variables: TenantQueryVariablesRequired<TVariables>,
	) => Promise<TData>;
	handlers?: QueryErrorHandlers;
} & Omit<
	BaseMutationOptions<TData, TenantQueryVariables<TVariables>, TError>,
	'onError' | 'onSuccess' | 'onSettled' | 'onMutate'
>;

type StaffQueryConfig<
	TApiClient,
	TData,
	TVariables extends Record<string, unknown>,
	TError = Error,
> = {
	queryKeyFn: (client: TApiClient) => unknown;
	fetcher: (client: TApiClient, variables: TVariables) => Promise<TData>;
	handlers?: QueryErrorHandlers;
} & BaseQueryOptions<TData, TVariables, TError>;

type StaffSuspenseQueryConfig<
	TApiClient,
	TData,
	TVariables extends Record<string, unknown>,
	TError = Error,
> = {
	queryKeyFn: (client: TApiClient) => unknown;
	fetcher: (client: TApiClient, variables: TVariables) => Promise<TData>;
	handlers?: QueryErrorHandlers;
} & BaseSuspenseQueryOptions<TData, TVariables, TError>;

type StaffMutationConfig<
	TApiClient,
	TData,
	TVariables extends Record<string, unknown>,
	TError = Error,
> = {
	mutationKeyFn: (client: TApiClient) => unknown;
	mutationFn: (client: TApiClient, variables: TVariables) => Promise<TData>;
	handlers?: QueryErrorHandlers;
} & BaseMutationOptions<TData, TVariables, TError>;

type QueryFactoryOptionsForClient<TApiClient> = QueryFactoryOptions<TApiClient>;

const mergeHandlers = (
	localHandlers?: QueryErrorHandlers,
	globalHandlers?: QueryErrorHandlers,
): QueryErrorHandlers => ({
	onLogout: localHandlers?.onLogout ?? globalHandlers?.onLogout,
	onToast: localHandlers?.onToast ?? globalHandlers?.onToast,
	resolveTenant: localHandlers?.resolveTenant ?? globalHandlers?.resolveTenant,
});

const resolveTenantId = <TVariables>(
	variables: TenantQueryVariables<TVariables>,
	handlers?: QueryErrorHandlers,
): string | undefined =>
	variables.tenantId ??
	(typeof handlers?.resolveTenant === 'function'
		? handlers.resolveTenant()
		: undefined);

const makeErrorHandler = (scope: QueryScope, handlers?: QueryErrorHandlers) => {
	return (error: unknown): void => {
		const failure = toApiFailure(error);
		if (failure.kind === 'abort') {
			return;
		}

		if (failure.kind === 'problem' && failure.status === 401) {
			handlers?.onLogout?.(failure);
			return;
		}

		handlers?.onToast?.(failure, { scope });
	};
};

export const buildTenantQueryOptions = <
	TApiClient,
	TData,
	TVariables extends Record<string, unknown>,
	TError = Error,
>(
	config: TenantQueryConfig<TApiClient, TData, TVariables, TError>,
	options: QueryFactoryOptionsForClient<TApiClient>,
) => {
	const { queryKeyFn, fetcher, handlers: localHandlers, ...restOptions } = config;
	const mergedHandlers = mergeHandlers(localHandlers, options.handlers);
	const queryKey = getQueryKey<TApiClient>(queryKeyFn);

	return {
		queryKey: [queryKey] as const,
		fetcher: async (
			variables: TenantQueryVariables<TVariables>,
		): Promise<TData> => {
			const tenantId = resolveTenantId(variables, mergedHandlers);
			if (!tenantId) {
				throw new Error('tenantId is required to create tenant-scoped client');
			}

			const client = options.clientAccessor.getOrCreateClient(tenantId);
			return fetcher(client, { ...(variables as TenantQueryVariables<TVariables>), tenantId });
		},
		onError: makeErrorHandler('tenant', mergedHandlers),
		...restOptions,
	};
};

export const buildTenantSuspenseQueryOptions = <
	TApiClient,
	TData,
	TVariables extends Record<string, unknown>,
	TError = Error,
>(
	config: TenantSuspenseQueryConfig<
		TApiClient,
		TData,
		TVariables,
		TError
	>,
	options: QueryFactoryOptionsForClient<TApiClient>,
) => {
	const { queryKeyFn, fetcher, handlers: localHandlers, ...restOptions } = config;
	const mergedHandlers = mergeHandlers(localHandlers, options.handlers);
	const queryKey = getQueryKey<TApiClient>(queryKeyFn);

	return {
		queryKey: [queryKey] as const,
		fetcher: async (
			variables: TenantQueryVariables<TVariables>,
		): Promise<TData> => {
			const tenantId = resolveTenantId(variables, mergedHandlers);
			if (!tenantId) {
				throw new Error('tenantId is required to create tenant-scoped client');
			}

			const client = options.clientAccessor.getOrCreateClient(tenantId);
			return fetcher(client, { ...(variables as TenantQueryVariables<TVariables>), tenantId });
		},
		onError: makeErrorHandler('tenant', mergedHandlers),
		...restOptions,
	};
};

export const buildTenantMutationOptions = <
	TApiClient,
	TData,
	TVariables extends Record<string, unknown>,
	TError = Error,
>(
	config: TenantMutationConfig<TApiClient, TData, TVariables, TError>,
	options: QueryFactoryOptionsForClient<TApiClient>,
) => {
	const { mutationKeyFn, mutationFn, handlers: localHandlers, ...restOptions } =
		config;
	const mergedHandlers = mergeHandlers(localHandlers, options.handlers);
	const mutationKey = getQueryKey<TApiClient>(mutationKeyFn);

	return {
		mutationKey: [mutationKey] as const,
		mutationFn: async (
			variables: TenantQueryVariables<TVariables>,
		): Promise<TData> => {
			const tenantId = resolveTenantId(variables, mergedHandlers);
			if (!tenantId) {
				throw new Error('tenantId is required to create tenant-scoped client');
			}

			const client = options.clientAccessor.getOrCreateClient(tenantId);
			return mutationFn(client, {
				...(variables as TenantQueryVariables<TVariables>),
				tenantId,
			});
		},
		onError: makeErrorHandler('tenant', mergedHandlers),
		...restOptions,
	};
};

export const buildStaffQueryOptions = <
	TApiClient,
	TData,
	TVariables extends Record<string, unknown>,
	TError = Error,
>(
	config: StaffQueryConfig<TApiClient, TData, TVariables, TError>,
	options: QueryFactoryOptionsForClient<TApiClient>,
) => {
	const { queryKeyFn, fetcher, handlers: localHandlers, ...restOptions } = config;
	const mergedHandlers = mergeHandlers(localHandlers, options.handlers);
	const queryKey = getQueryKey<TApiClient>(queryKeyFn);

	return {
		queryKey: [queryKey] as const,
		fetcher: async (variables: TVariables): Promise<TData> => {
			const client = options.clientAccessor.getOrCreateStaffClient();
			return fetcher(client, variables);
		},
		onError: makeErrorHandler('staff', mergedHandlers),
		...restOptions,
	};
};

export const buildStaffSuspenseQueryOptions = <
	TApiClient,
	TData,
	TVariables extends Record<string, unknown>,
	TError = Error,
>(
	config: StaffSuspenseQueryConfig<TApiClient, TData, TVariables, TError>,
	options: QueryFactoryOptionsForClient<TApiClient>,
) => {
	const { queryKeyFn, fetcher, handlers: localHandlers, ...restOptions } = config;
	const mergedHandlers = mergeHandlers(localHandlers, options.handlers);
	const queryKey = getQueryKey<TApiClient>(queryKeyFn);

	return {
		queryKey: [queryKey] as const,
		fetcher: async (variables: TVariables): Promise<TData> => {
			const client = options.clientAccessor.getOrCreateStaffClient();
			return fetcher(client, variables);
		},
		onError: makeErrorHandler('staff', mergedHandlers),
		...restOptions,
	};
};

export const buildStaffMutationOptions = <
	TApiClient,
	TData,
	TVariables extends Record<string, unknown>,
	TError = Error,
>(
	config: StaffMutationConfig<TApiClient, TData, TVariables, TError>,
	options: QueryFactoryOptionsForClient<TApiClient>,
) => {
	const { mutationKeyFn, mutationFn, handlers: localHandlers, ...restOptions } =
		config;
	const mergedHandlers = mergeHandlers(localHandlers, options.handlers);
	const mutationKey = getQueryKey<TApiClient>(mutationKeyFn);

	return {
		mutationKey: [mutationKey] as const,
		mutationFn: async (variables: TVariables): Promise<TData> => {
			const client = options.clientAccessor.getOrCreateStaffClient();
			return mutationFn(client, variables);
		},
		onError: makeErrorHandler('staff', mergedHandlers),
		...restOptions,
	};
};

export const buildAnonymousQueryOptions = <
	TApiClient,
	TData,
	TVariables extends Record<string, unknown>,
	TError = Error,
>(
	config: StaffQueryConfig<TApiClient, TData, TVariables, TError>,
	options: QueryFactoryOptionsForClient<TApiClient>,
) => {
	const { queryKeyFn, fetcher, handlers: localHandlers, ...restOptions } = config;
	const mergedHandlers = mergeHandlers(localHandlers, options.handlers);
	const queryKey = getQueryKey<TApiClient>(queryKeyFn);

	return {
		queryKey: [queryKey] as const,
		fetcher: async (variables: TVariables): Promise<TData> => {
			const client = options.clientAccessor.getOrCreateAnonymousClient();
			return fetcher(client, variables);
		},
		onError: makeErrorHandler('anonymous', mergedHandlers),
		...restOptions,
	};
};

export const buildAnonymousSuspenseQueryOptions = <
	TApiClient,
	TData,
	TVariables extends Record<string, unknown>,
	TError = Error,
>(
	config: StaffSuspenseQueryConfig<TApiClient, TData, TVariables, TError>,
	options: QueryFactoryOptionsForClient<TApiClient>,
) => {
	const { queryKeyFn, fetcher, handlers: localHandlers, ...restOptions } = config;
	const mergedHandlers = mergeHandlers(localHandlers, options.handlers);
	const queryKey = getQueryKey<TApiClient>(queryKeyFn);

	return {
		queryKey: [queryKey] as const,
		fetcher: async (variables: TVariables): Promise<TData> => {
			const client = options.clientAccessor.getOrCreateAnonymousClient();
			return fetcher(client, variables);
		},
		onError: makeErrorHandler('anonymous', mergedHandlers),
		...restOptions,
	};
};

export const buildAnonymousMutationOptions = <
	TApiClient,
	TData,
	TVariables extends Record<string, unknown>,
	TError = Error,
>(
	config: StaffMutationConfig<TApiClient, TData, TVariables, TError>,
	options: QueryFactoryOptionsForClient<TApiClient>,
) => {
	const { mutationKeyFn, mutationFn, handlers: localHandlers, ...restOptions } =
		config;
	const mergedHandlers = mergeHandlers(localHandlers, options.handlers);
	const mutationKey = getQueryKey<TApiClient>(mutationKeyFn);

	return {
		mutationKey: [mutationKey] as const,
		mutationFn: async (variables: TVariables): Promise<TData> => {
			const client = options.clientAccessor.getOrCreateAnonymousClient();
			return mutationFn(client, variables);
		},
		onError: makeErrorHandler('anonymous', mergedHandlers),
		...restOptions,
	};
};

export const buildAuthQueryOptions = <
	TApiClient,
	TData,
	TVariables extends Record<string, unknown>,
	TError = Error,
>(
	config: StaffQueryConfig<TApiClient, TData, TVariables, TError>,
	options: QueryFactoryOptionsForClient<TApiClient>,
) => buildStaffQueryOptions(config, options);

export const buildAuthSuspenseQueryOptions = <
	TApiClient,
	TData,
	TVariables extends Record<string, unknown>,
	TError = Error,
>(
	config: StaffSuspenseQueryConfig<TApiClient, TData, TVariables, TError>,
	options: QueryFactoryOptionsForClient<TApiClient>,
) => buildStaffSuspenseQueryOptions(config, options);

export const buildAuthMutationOptions = <
	TApiClient,
	TData,
	TVariables extends Record<string, unknown>,
	TError = Error,
>(
	config: StaffMutationConfig<TApiClient, TData, TVariables, TError>,
	options: QueryFactoryOptionsForClient<TApiClient>,
) => buildStaffMutationOptions(config, options);

export const createTenantQuery = <
	TApiClient,
	TData,
	TVariables extends Record<string, unknown> = EmptyVariables,
	TError = Error,
>(
	config: Omit<
		TenantQueryConfig<TApiClient, TData, TVariables, TError>,
		'handlers'
	>,
	options: QueryFactoryOptionsForClient<TApiClient>,
) =>
	createQuery(
		buildTenantQueryOptions(config, options),
	);

export const createTenantSuspenseQuery = <
	TApiClient,
	TData,
	TVariables extends Record<string, unknown> = EmptyVariables,
	TError = Error,
>(
	config: Omit<
		TenantSuspenseQueryConfig<TApiClient, TData, TVariables, TError>,
		'handlers'
	>,
	options: QueryFactoryOptionsForClient<TApiClient>,
) =>
	createSuspenseQuery(
		buildTenantSuspenseQueryOptions(config, options),
	);

export const createTenantMutation = <
	TApiClient,
	TData,
	TVariables extends Record<string, unknown> = EmptyVariables,
	TError = Error,
>(
	config: Omit<
		TenantMutationConfig<TApiClient, TData, TVariables, TError>,
		'handlers'
	>,
	options: QueryFactoryOptionsForClient<TApiClient>,
) =>
	createMutation(
		buildTenantMutationOptions(config, options),
	);

export const createStaffQuery = <
	TApiClient,
	TData,
	TVariables extends Record<string, unknown> = EmptyVariables,
	TError = Error,
>(
	config: Omit<
		StaffQueryConfig<TApiClient, TData, TVariables, TError>,
		'handlers'
	>,
	options: QueryFactoryOptionsForClient<TApiClient>,
) =>
	createQuery(
		buildStaffQueryOptions(config, options),
	);

export const createStaffSuspenseQuery = <
	TApiClient,
	TData,
	TVariables extends Record<string, unknown> = EmptyVariables,
	TError = Error,
>(
	config: Omit<
		StaffSuspenseQueryConfig<TApiClient, TData, TVariables, TError>,
		'handlers'
	>,
	options: QueryFactoryOptionsForClient<TApiClient>,
) =>
	createSuspenseQuery(
		buildStaffSuspenseQueryOptions(config, options),
	);

export const createStaffMutation = <
	TApiClient,
	TData,
	TVariables extends Record<string, unknown> = EmptyVariables,
	TError = Error,
>(
	config: Omit<
		StaffMutationConfig<TApiClient, TData, TVariables, TError>,
		'handlers'
	>,
	options: QueryFactoryOptionsForClient<TApiClient>,
) =>
	createMutation(
		buildStaffMutationOptions(config, options),
	);

export const createAuthQuery = <
	TApiClient,
	TData,
	TVariables extends Record<string, unknown> = EmptyVariables,
	TError = Error,
>(
	config: Omit<
		StaffQueryConfig<TApiClient, TData, TVariables, TError>,
		'handlers'
	>,
	options: QueryFactoryOptionsForClient<TApiClient>,
) =>
	createQuery(
		buildAuthQueryOptions(config, options),
	);

export const createAuthSuspenseQuery = <
	TApiClient,
	TData,
	TVariables extends Record<string, unknown> = EmptyVariables,
	TError = Error,
>(
	config: Omit<
		StaffSuspenseQueryConfig<TApiClient, TData, TVariables, TError>,
		'handlers'
	>,
	options: QueryFactoryOptionsForClient<TApiClient>,
) =>
	createSuspenseQuery(
		buildAuthSuspenseQueryOptions(config, options),
	);

export const createAuthMutation = <
	TApiClient,
	TData,
	TVariables extends Record<string, unknown> = EmptyVariables,
	TError = Error,
>(
	config: Omit<
		StaffMutationConfig<TApiClient, TData, TVariables, TError>,
		'handlers'
	>,
	options: QueryFactoryOptionsForClient<TApiClient>,
) =>
	createMutation(
		buildAuthMutationOptions(config, options),
	);

export const createAnonymousQuery = <
	TApiClient,
	TData,
	TVariables extends Record<string, unknown> = EmptyVariables,
	TError = Error,
>(
	config: Omit<
		StaffQueryConfig<TApiClient, TData, TVariables, TError>,
		'handlers'
	>,
	options: QueryFactoryOptionsForClient<TApiClient>,
) =>
	createQuery(
		buildAnonymousQueryOptions(config, options),
	);

export const createAnonymousSuspenseQuery = <
	TApiClient,
	TData,
	TVariables extends Record<string, unknown> = EmptyVariables,
	TError = Error,
>(
	config: Omit<
		StaffSuspenseQueryConfig<TApiClient, TData, TVariables, TError>,
		'handlers'
	>,
	options: QueryFactoryOptionsForClient<TApiClient>,
) =>
	createSuspenseQuery(
		buildAnonymousSuspenseQueryOptions(config, options),
	);

export const createAnonymousMutation = <
	TApiClient,
	TData,
	TVariables extends Record<string, unknown> = EmptyVariables,
	TError = Error,
>(
	config: Omit<
		StaffMutationConfig<TApiClient, TData, TVariables, TError>,
		'handlers'
	>,
	options: QueryFactoryOptionsForClient<TApiClient>,
) =>
	createMutation(
		buildAnonymousMutationOptions(config, options),
	);
