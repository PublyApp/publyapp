import { toApiFailure } from '../api-failure/to-api-failure';
import { getQueryKey } from './keys';
import type {
	ClientAccessor,
	QueryErrorHandlers,
	QueryFactoryOptions,
} from './types';

type QueryScope = 'tenant' | 'staff' | 'anonymous' | 'auth';

type TenantQueryVariables<TVariables> = { tenantId?: string } & Omit<
	TVariables,
	'tenantId'
>;
type TenantQueryVariablesRequired<TVariables> = { tenantId: string } & Omit<
	TVariables,
	'tenantId'
>;

type QueryBaseOptions<TData, TVariables, TError = Error> = {
	onError?: (error: TError) => void;
	[key: string]: unknown;
};

type BaseQueryOptions<TData, TVariables, TError = Error> = Omit<
	QueryBaseOptions<TData, TVariables, TError>,
	'queryKey' | 'fetcher'
>;

type BaseSuspenseQueryOptions<TData, TVariables, TError = Error> = Omit<
	QueryBaseOptions<TData, TVariables, TError>,
	'queryKey' | 'fetcher'
>;

type BaseMutationOptions<TData, TVariables, TError = Error> = Omit<
	QueryBaseOptions<TData, TVariables, TError>,
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
	'use' | 'variables'
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

const normalizeTenantId = (tenantId: string | undefined): string | undefined => {
	const normalized = tenantId?.trim();
	return normalized ? normalized : undefined;
};

const mergeHandlers = (
	localHandlers?: QueryErrorHandlers,
	globalHandlers?: QueryErrorHandlers,
): QueryErrorHandlers => ({
	onLogout: localHandlers?.onLogout ?? globalHandlers?.onLogout,
	onToast: localHandlers?.onToast ?? globalHandlers?.onToast,
	resolveTenant: localHandlers?.resolveTenant ?? globalHandlers?.resolveTenant,
});

const shouldLogoutForScope = (scope: QueryScope): boolean =>
	scope === 'tenant' || scope === 'staff';

const resolveTenantId = <TVariables>(
	variables: TenantQueryVariables<TVariables>,
	handlers?: QueryErrorHandlers,
): string | undefined => {
	const fromVariables = normalizeTenantId(variables.tenantId);
	if (fromVariables) {
		return fromVariables;
	}

	const fromHandler =
		typeof handlers?.resolveTenant === 'function'
			? handlers.resolveTenant()
			: undefined;

	return normalizeTenantId(fromHandler);
};

const stripTenantIdFromVariables = <TVariables>(
	variables?: TenantQueryVariables<TVariables>,
): Record<string, unknown> | undefined => {
	if (!variables) {
		return undefined;
	}

	const { tenantId: _tenantId, ...rest } = variables as Record<
		string,
		unknown
	>;
	const entries = Object.entries(rest).filter(([, value]) => value !== undefined);
	if (entries.length === 0) {
		return undefined;
	}

	return Object.fromEntries(entries);
};

const composeOnError = <TError>(
	localOnError: ((error: TError) => void) | undefined,
	generatedOnError: (error: TError) => void,
) =>
	(localOnError === undefined
		? generatedOnError
		: (error: TError) => {
			generatedOnError(error);
			localOnError(error);
		});

const makeErrorHandler = (scope: QueryScope, handlers?: QueryErrorHandlers) => {
	return (error: unknown): void => {
		const failure = toApiFailure(error);
		if (failure.kind === 'abort') {
			return;
		}

		if (
			shouldLogoutForScope(scope) &&
			failure.kind === 'problem' &&
			failure.status === 401
		) {
			handlers?.onLogout?.(failure);
			return;
		}

		handlers?.onToast?.(failure, { scope });
	};
};

const buildScopedQueryKey = (
	scope: QueryScope,
	queryKey: string[],
	tenantId?: string,
	variables?: Record<string, unknown>,
) => {
	const key: (string | Record<string, unknown>)[] = [
		scope,
		queryKey.join('.'),
	];

	if (tenantId) {
		key.push(tenantId);
	}

	if (variables) {
		key.push(variables);
	}

	return key;
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
	const {
		queryKeyFn,
		fetcher,
		handlers: localHandlers,
		onError: localOnError,
		...restOptions
	} = config;
	const mergedHandlers = mergeHandlers(localHandlers, options.handlers);
	const queryKey = getQueryKey<TApiClient>(queryKeyFn);

	return {
		queryKey: (
			variables: TenantQueryVariables<TVariables> = {} as TenantQueryVariables<TVariables>,
		) => {
			const tenantId = resolveTenantId(variables, mergedHandlers);
			return buildScopedQueryKey(
				'tenant',
				queryKey,
				tenantId,
				stripTenantIdFromVariables(variables),
			);
		},
		fetcher: async (
			variables: TenantQueryVariables<TVariables>,
		): Promise<TData> => {
			const tenantId = resolveTenantId(variables, mergedHandlers);
			if (!tenantId) {
				throw new Error('tenantId is required to create tenant-scoped client');
			}

			const client = options.clientAccessor.getOrCreateClient(tenantId);
			return fetcher(client, {
				...(variables as TenantQueryVariables<TVariables>),
				tenantId,
			});
		},
		onError: composeOnError(
			localOnError,
			makeErrorHandler('tenant', mergedHandlers),
		),
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
	const {
		queryKeyFn,
		fetcher,
		handlers: localHandlers,
		onError: localOnError,
		...restOptions
	} = config;
	const mergedHandlers = mergeHandlers(localHandlers, options.handlers);
	const queryKey = getQueryKey<TApiClient>(queryKeyFn);

	return {
		queryKey: (
			variables: TenantQueryVariables<TVariables> = {} as TenantQueryVariables<TVariables>,
		) => {
			const tenantId = resolveTenantId(variables, mergedHandlers);
			return buildScopedQueryKey(
				'tenant',
				queryKey,
				tenantId,
				stripTenantIdFromVariables(variables),
			);
		},
		fetcher: async (
			variables: TenantQueryVariables<TVariables>,
		): Promise<TData> => {
			const tenantId = resolveTenantId(variables, mergedHandlers);
			if (!tenantId) {
				throw new Error('tenantId is required to create tenant-scoped client');
			}

			const client = options.clientAccessor.getOrCreateClient(tenantId);
			return fetcher(client, {
				...(variables as TenantQueryVariables<TVariables>),
				tenantId,
			});
		},
		onError: composeOnError(
			localOnError,
			makeErrorHandler('tenant', mergedHandlers),
		),
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
	const {
		mutationKeyFn,
		mutationFn,
		handlers: localHandlers,
		onError: localOnError,
		...restOptions
	} = config;
	const mergedHandlers = mergeHandlers(localHandlers, options.handlers);
	const mutationKey = getQueryKey<TApiClient>(mutationKeyFn);

	return {
		mutationKey: buildScopedQueryKey('tenant', mutationKey),
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
		onError: composeOnError(
			localOnError,
			makeErrorHandler('tenant', mergedHandlers),
		),
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
	const {
		queryKeyFn,
		fetcher,
		handlers: localHandlers,
		onError: localOnError,
		...restOptions
	} = config;
	const mergedHandlers = mergeHandlers(localHandlers, options.handlers);
	const queryKey = getQueryKey<TApiClient>(queryKeyFn);

	return {
		queryKey: (variables: TVariables) =>
			buildScopedQueryKey('staff', queryKey, undefined, variables as Record<string, unknown>),
		fetcher: async (variables: TVariables): Promise<TData> => {
			const client = options.clientAccessor.getOrCreateStaffClient();
			return fetcher(client, variables);
		},
		onError: composeOnError(
			localOnError,
			makeErrorHandler('staff', mergedHandlers),
		),
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
	const {
		queryKeyFn,
		fetcher,
		handlers: localHandlers,
		onError: localOnError,
		...restOptions
	} = config;
	const mergedHandlers = mergeHandlers(localHandlers, options.handlers);
	const queryKey = getQueryKey<TApiClient>(queryKeyFn);

	return {
		queryKey: (variables: TVariables) =>
			buildScopedQueryKey('staff', queryKey, undefined, variables as Record<string, unknown>),
		fetcher: async (variables: TVariables): Promise<TData> => {
			const client = options.clientAccessor.getOrCreateStaffClient();
			return fetcher(client, variables);
		},
		onError: composeOnError(
			localOnError,
			makeErrorHandler('staff', mergedHandlers),
		),
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
	const {
		mutationKeyFn,
		mutationFn,
		handlers: localHandlers,
		onError: localOnError,
		...restOptions
	} = config;
	const mergedHandlers = mergeHandlers(localHandlers, options.handlers);
	const mutationKey = getQueryKey<TApiClient>(mutationKeyFn);

	return {
		mutationKey: buildScopedQueryKey('staff', mutationKey),
		mutationFn: async (variables: TVariables): Promise<TData> => {
			const client = options.clientAccessor.getOrCreateStaffClient();
			return mutationFn(client, variables);
		},
		onError: composeOnError(
			localOnError,
			makeErrorHandler('staff', mergedHandlers),
		),
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
	const {
		queryKeyFn,
		fetcher,
		handlers: localHandlers,
		onError: localOnError,
		...restOptions
	} = config;
	const mergedHandlers = mergeHandlers(localHandlers, options.handlers);
	const queryKey = getQueryKey<TApiClient>(queryKeyFn);

	return {
		queryKey: (variables: TVariables) =>
			buildScopedQueryKey(
				'anonymous',
				queryKey,
				undefined,
				variables as Record<string, unknown>,
			),
		fetcher: async (variables: TVariables): Promise<TData> => {
			const client = options.clientAccessor.getOrCreateAnonymousClient();
			return fetcher(client, variables);
		},
		onError: composeOnError(
			localOnError,
			makeErrorHandler('anonymous', mergedHandlers),
		),
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
	const {
		queryKeyFn,
		fetcher,
		handlers: localHandlers,
		onError: localOnError,
		...restOptions
	} = config;
	const mergedHandlers = mergeHandlers(localHandlers, options.handlers);
	const queryKey = getQueryKey<TApiClient>(queryKeyFn);

	return {
		queryKey: (variables: TVariables) =>
			buildScopedQueryKey(
				'anonymous',
				queryKey,
				undefined,
				variables as Record<string, unknown>,
			),
		fetcher: async (variables: TVariables): Promise<TData> => {
			const client = options.clientAccessor.getOrCreateAnonymousClient();
			return fetcher(client, variables);
		},
		onError: composeOnError(
			localOnError,
			makeErrorHandler('anonymous', mergedHandlers),
		),
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
	const {
		mutationKeyFn,
		mutationFn,
		handlers: localHandlers,
		onError: localOnError,
		...restOptions
	} = config;
	const mergedHandlers = mergeHandlers(localHandlers, options.handlers);
	const mutationKey = getQueryKey<TApiClient>(mutationKeyFn);

	return {
		mutationKey: buildScopedQueryKey('anonymous', mutationKey),
		mutationFn: async (variables: TVariables): Promise<TData> => {
			const client = options.clientAccessor.getOrCreateAnonymousClient();
			return mutationFn(client, variables);
		},
		onError: composeOnError(
			localOnError,
			makeErrorHandler('anonymous', mergedHandlers),
		),
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
) => {
	const {
		queryKeyFn,
		fetcher,
		handlers: localHandlers,
		onError: localOnError,
		...restOptions
	} = config;
	const mergedHandlers = mergeHandlers(localHandlers, options.handlers);
	const queryKey = getQueryKey<TApiClient>(queryKeyFn);

	return {
		queryKey: (variables: TVariables) =>
			buildScopedQueryKey('auth', queryKey, undefined, variables as Record<string, unknown>),
		fetcher: async (variables: TVariables): Promise<TData> => {
			const client = options.clientAccessor.getOrCreateAnonymousClient();
			return fetcher(client, variables);
		},
		onError: composeOnError(
			localOnError,
			makeErrorHandler('auth', mergedHandlers),
		),
		...restOptions,
	};
};

export const buildAuthSuspenseQueryOptions = <
	TApiClient,
	TData,
	TVariables extends Record<string, unknown>,
	TError = Error,
>(
	config: StaffSuspenseQueryConfig<TApiClient, TData, TVariables, TError>,
	options: QueryFactoryOptionsForClient<TApiClient>,
) => {
	const {
		queryKeyFn,
		fetcher,
		handlers: localHandlers,
		onError: localOnError,
		...restOptions
	} = config;
	const mergedHandlers = mergeHandlers(localHandlers, options.handlers);
	const queryKey = getQueryKey<TApiClient>(queryKeyFn);

	return {
		queryKey: (variables: TVariables) =>
			buildScopedQueryKey('auth', queryKey, undefined, variables as Record<string, unknown>),
		fetcher: async (variables: TVariables): Promise<TData> => {
			const client = options.clientAccessor.getOrCreateAnonymousClient();
			return fetcher(client, variables);
		},
		onError: composeOnError(
			localOnError,
			makeErrorHandler('auth', mergedHandlers),
		),
		...restOptions,
	};
};

export const buildAuthMutationOptions = <
	TApiClient,
	TData,
	TVariables extends Record<string, unknown>,
	TError = Error,
>(
	config: StaffMutationConfig<TApiClient, TData, TVariables, TError>,
	options: QueryFactoryOptionsForClient<TApiClient>,
) => {
	const {
		mutationKeyFn,
		mutationFn,
		handlers: localHandlers,
		onError: localOnError,
		...restOptions
	} = config;
	const mergedHandlers = mergeHandlers(localHandlers, options.handlers);
	const mutationKey = getQueryKey<TApiClient>(mutationKeyFn);

	return {
		mutationKey: buildScopedQueryKey('auth', mutationKey),
		mutationFn: async (variables: TVariables): Promise<TData> => {
			const client = options.clientAccessor.getOrCreateAnonymousClient();
			return mutationFn(client, variables);
		},
		onError: composeOnError(
			localOnError,
			makeErrorHandler('auth', mergedHandlers),
		),
		...restOptions,
	};
};
