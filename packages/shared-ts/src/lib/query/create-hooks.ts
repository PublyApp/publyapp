import { toApiFailure } from '../api-failure/to-api-failure';
import type { ApiFailure } from '../api-failure/types';
import type { MutationFeedbackMeta } from '../mutation-feedback/types';
import type { QueryKeySegment } from './keys';
import type {
	QueryScope,
	QueryErrorHandlers,
	QueryFactoryOptions,
} from './types';

type TenantQueryVariables<TVariables> = { tenantId?: string } & Omit<
	TVariables,
	'tenantId'
>;

type ScopedQueryKeySegment = QueryKeySegment | Record<string, unknown>;

type TenantQueryVariablesRequired<TVariables> = { tenantId: string } & Omit<
	TVariables,
	'tenantId'
>;

type QueryBaseOptions<TError = Error> = {
	onError?: (error: TError) => void;
	[key: string]: unknown;
};

// NOTE: these were previously `Omit<QueryBaseOptions<TError>, 'queryKey' | 'fetcher'>`
// (and similar) even though `QueryBaseOptions` never declared those keys — a no-op
// Omit. `Omit` over a type with a string index signature widens `keyof` and can make
// TS lose the precise `onError` property type on destructure (surfaces as bogus
// "Argument of type 'unknown' is not assignable to ((error: TError) => void)"
// errors at every call site). Plain aliases keep the identical type, without the bug.
type BaseQueryOptions<TError = Error> = QueryBaseOptions<TError>;

type BaseSuspenseQueryOptions<TError = Error> = QueryBaseOptions<TError>;

type BaseMutationOptions<TError = Error> = QueryBaseOptions<TError> & {
	meta: MutationFeedbackMeta;
};

type TenantQueryConfig<
	TApiClient,
	TData,
	TVariables extends Record<string, unknown>,
	TError = Error,
> = {
	queryKeyFn: () => QueryKeySegment[];
	fetcher: (
		client: TApiClient,
		variables: TenantQueryVariablesRequired<TVariables>,
	) => Promise<TData>;
	handlers?: QueryErrorHandlers;
} & BaseQueryOptions<TError>;

type TenantSuspenseQueryConfig<
	TApiClient,
	TData,
	TVariables extends Record<string, unknown>,
	TError = Error,
> = {
	queryKeyFn: () => QueryKeySegment[];
	fetcher: (
		client: TApiClient,
		variables: TenantQueryVariablesRequired<TVariables>,
	) => Promise<TData>;
	handlers?: QueryErrorHandlers;
} & BaseSuspenseQueryOptions<TError>;

type TenantMutationConfig<
	TApiClient,
	TData,
	TVariables extends Record<string, unknown>,
	TError = Error,
> = {
	mutationKeyFn: () => QueryKeySegment[];
	mutationFn: (
		client: TApiClient,
		variables: TenantQueryVariablesRequired<TVariables>,
	) => Promise<TData>;
	handlers?: QueryErrorHandlers;
} & BaseMutationOptions<TError>;

type StaffQueryConfig<
	TApiClient,
	TData,
	TVariables extends Record<string, unknown>,
	TError = Error,
> = {
	queryKeyFn: () => QueryKeySegment[];
	fetcher: (client: TApiClient, variables: TVariables) => Promise<TData>;
	handlers?: QueryErrorHandlers;
} & BaseQueryOptions<TError>;

type StaffSuspenseQueryConfig<
	TApiClient,
	TData,
	TVariables extends Record<string, unknown>,
	TError = Error,
> = {
	queryKeyFn: () => QueryKeySegment[];
	fetcher: (client: TApiClient, variables: TVariables) => Promise<TData>;
	handlers?: QueryErrorHandlers;
} & BaseSuspenseQueryOptions<TError>;

type StaffMutationConfig<
	TApiClient,
	TData,
	TVariables extends Record<string, unknown>,
	TError = Error,
> = {
	mutationKeyFn: () => QueryKeySegment[];
	mutationFn: (client: TApiClient, variables: TVariables) => Promise<TData>;
	handlers?: QueryErrorHandlers;
} & BaseMutationOptions<TError>;

type QueryFactoryOptionsForClient<TApiClient> = QueryFactoryOptions<TApiClient>;

const normalizeTenantId = (
	tenantId: string | undefined,
): string | undefined => {
	const normalized = tenantId?.trim();
	if (normalized) {
		return normalized;
	}
	return undefined;
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

const stripUndefinedVariables = (
	variables?: Record<string, unknown>,
): Record<string, unknown> | undefined => {
	if (!variables) {
		return undefined;
	}

	const entries = Object.entries(variables).filter(
		([, value]) => value !== undefined,
	);
	if (entries.length === 0) {
		return undefined;
	}

	entries.sort(([left], [right]) => left.localeCompare(right));
	return Object.fromEntries(entries);
};

const stripTenantIdFromVariables = <TVariables>(
	variables?: TenantQueryVariables<TVariables>,
): Record<string, unknown> | undefined => {
	if (!variables) {
		return undefined;
	}

	const { tenantId: _tenantId, ...rest } = variables as Record<string, unknown>;
	return stripUndefinedVariables(rest);
};

const requireTenantId = (tenantId: string | undefined): string => {
	if (!tenantId) {
		throw new Error('tenantId is required to create tenant-scoped client');
	}

	return tenantId;
};

const composeOnError = <TError>(
	localOnError: ((error: TError) => void) | undefined,
	generatedOnError: (error: TError) => void,
) =>
	localOnError === undefined
		? generatedOnError
		: (error: TError) => {
				try {
					generatedOnError(error);
				} finally {
					localOnError(error);
				}
			};

// Generic over TError so its return type structurally matches composeOnError's
// `(error: TError) => void` slot at every call site: the body only ever forwards
// to `toApiFailure(unknown)`, so this is sound for any TError, not just `unknown`.
const makeErrorHandler = <TError>(
	scope: QueryScope,
	handlers?: QueryErrorHandlers,
): ((error: TError) => void) => {
	return (error) => {
		const failure = toApiFailure(error);
		if (failure.kind === 'abort') {
			return;
		}

		if (shouldLogoutForScope(scope) && getFailureStatus(failure) === 401) {
			handlers?.onLogout?.(failure);
			return;
		}

		handlers?.onToast?.(failure, { scope });
	};
};

const getFailureStatus = (failure: ApiFailure): number | undefined =>
	failure.kind === 'problem' || failure.kind === 'validation'
		? failure.status
		: undefined;

const buildScopedQueryKey = (
	scope: QueryScope,
	queryKey: QueryKeySegment[],
	tenantId?: string,
	variables?: Record<string, unknown>,
) => {
	const key: ScopedQueryKeySegment[] = [scope, ...queryKey];

	if (tenantId) {
		key.push(tenantId);
	}

	if (variables) {
		key.push(variables);
	}

	return key;
};

/**
 * Prepends the scope prefix `buildScopedQueryKey` bakes into every generated
 * query/mutation key — the one place that prefix is defined. Use this at
 * invalidation call sites instead of hand-writing `['staff', ...KEY]`, so a
 * future change to the prefix can never silently desync a hand-assembled key
 * from what the factory actually produced (a no-op `invalidateQueries` that
 * fails without an error).
 */
export const scopedKey = (
	scope: QueryScope,
	queryKey: readonly QueryKeySegment[],
): QueryKeySegment[] => [scope, ...queryKey];

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
	const queryKey = queryKeyFn();

	return {
		queryKey: (
			variables: TenantQueryVariables<TVariables> = {} as TenantQueryVariables<TVariables>,
		) => {
			const tenantId = requireTenantId(
				resolveTenantId(variables, mergedHandlers),
			);
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
			const tenantId = requireTenantId(
				resolveTenantId(variables, mergedHandlers),
			);

			const client = options.clientAccessor.getOrCreateClient(tenantId);
			return fetcher(client, {
				...(variables as TenantQueryVariables<TVariables>),
				tenantId,
			});
		},
		onError: composeOnError<TError>(
			localOnError,
			makeErrorHandler<TError>('tenant', mergedHandlers),
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
	config: TenantSuspenseQueryConfig<TApiClient, TData, TVariables, TError>,
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
	const queryKey = queryKeyFn();

	return {
		queryKey: (
			variables: TenantQueryVariables<TVariables> = {} as TenantQueryVariables<TVariables>,
		) => {
			const tenantId = requireTenantId(
				resolveTenantId(variables, mergedHandlers),
			);
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
			const tenantId = requireTenantId(
				resolveTenantId(variables, mergedHandlers),
			);

			const client = options.clientAccessor.getOrCreateClient(tenantId);
			return fetcher(client, {
				...(variables as TenantQueryVariables<TVariables>),
				tenantId,
			});
		},
		onError: composeOnError<TError>(
			localOnError,
			makeErrorHandler<TError>('tenant', mergedHandlers),
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
	const mutationKey = mutationKeyFn();

	return {
		mutationKey: buildScopedQueryKey('tenant', mutationKey),
		mutationFn: async (
			variables: TenantQueryVariables<TVariables>,
		): Promise<TData> => {
			const tenantId = requireTenantId(
				resolveTenantId(variables, mergedHandlers),
			);

			const client = options.clientAccessor.getOrCreateClient(tenantId);
			return mutationFn(client, {
				...(variables as TenantQueryVariables<TVariables>),
				tenantId,
			});
		},
		onError: composeOnError<TError>(
			localOnError,
			makeErrorHandler<TError>('tenant', mergedHandlers),
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
	const queryKey = queryKeyFn();

	return {
		queryKey: (variables: TVariables) =>
			buildScopedQueryKey(
				'staff',
				queryKey,
				undefined,
				stripUndefinedVariables(variables as Record<string, unknown>),
			),
		fetcher: async (variables: TVariables): Promise<TData> => {
			const client = options.clientAccessor.getOrCreateStaffClient();
			return fetcher(client, variables);
		},
		onError: composeOnError<TError>(
			localOnError,
			makeErrorHandler<TError>('staff', mergedHandlers),
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
	const queryKey = queryKeyFn();

	return {
		queryKey: (variables: TVariables) =>
			buildScopedQueryKey(
				'staff',
				queryKey,
				undefined,
				stripUndefinedVariables(variables as Record<string, unknown>),
			),
		fetcher: async (variables: TVariables): Promise<TData> => {
			const client = options.clientAccessor.getOrCreateStaffClient();
			return fetcher(client, variables);
		},
		onError: composeOnError<TError>(
			localOnError,
			makeErrorHandler<TError>('staff', mergedHandlers),
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
	const mutationKey = mutationKeyFn();

	return {
		mutationKey: buildScopedQueryKey('staff', mutationKey),
		mutationFn: async (variables: TVariables): Promise<TData> => {
			const client = options.clientAccessor.getOrCreateStaffClient();
			return mutationFn(client, variables);
		},
		onError: composeOnError<TError>(
			localOnError,
			makeErrorHandler<TError>('staff', mergedHandlers),
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
	const queryKey = queryKeyFn();

	return {
		queryKey: (variables: TVariables) =>
			buildScopedQueryKey(
				'anonymous',
				queryKey,
				undefined,
				stripUndefinedVariables(variables as Record<string, unknown>),
			),
		fetcher: async (variables: TVariables): Promise<TData> => {
			const client = options.clientAccessor.getOrCreateAnonymousClient();
			return fetcher(client, variables);
		},
		onError: composeOnError<TError>(
			localOnError,
			makeErrorHandler<TError>('anonymous', mergedHandlers),
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
	const queryKey = queryKeyFn();

	return {
		queryKey: (variables: TVariables) =>
			buildScopedQueryKey(
				'anonymous',
				queryKey,
				undefined,
				stripUndefinedVariables(variables as Record<string, unknown>),
			),
		fetcher: async (variables: TVariables): Promise<TData> => {
			const client = options.clientAccessor.getOrCreateAnonymousClient();
			return fetcher(client, variables);
		},
		onError: composeOnError<TError>(
			localOnError,
			makeErrorHandler<TError>('anonymous', mergedHandlers),
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
	const mutationKey = mutationKeyFn();

	return {
		mutationKey: buildScopedQueryKey('anonymous', mutationKey),
		mutationFn: async (variables: TVariables): Promise<TData> => {
			const client = options.clientAccessor.getOrCreateAnonymousClient();
			return mutationFn(client, variables);
		},
		onError: composeOnError<TError>(
			localOnError,
			makeErrorHandler<TError>('anonymous', mergedHandlers),
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
	const queryKey = queryKeyFn();

	return {
		queryKey: (variables: TVariables) =>
			buildScopedQueryKey(
				'auth',
				queryKey,
				undefined,
				stripUndefinedVariables(variables as Record<string, unknown>),
			),
		fetcher: async (variables: TVariables): Promise<TData> => {
			const client = options.clientAccessor.getOrCreateAnonymousClient();
			return fetcher(client, variables);
		},
		onError: composeOnError<TError>(
			localOnError,
			makeErrorHandler<TError>('auth', mergedHandlers),
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
	const queryKey = queryKeyFn();

	return {
		queryKey: (variables: TVariables) =>
			buildScopedQueryKey(
				'auth',
				queryKey,
				undefined,
				stripUndefinedVariables(variables as Record<string, unknown>),
			),
		fetcher: async (variables: TVariables): Promise<TData> => {
			const client = options.clientAccessor.getOrCreateAnonymousClient();
			return fetcher(client, variables);
		},
		onError: composeOnError<TError>(
			localOnError,
			makeErrorHandler<TError>('auth', mergedHandlers),
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
	const mutationKey = mutationKeyFn();

	return {
		mutationKey: buildScopedQueryKey('auth', mutationKey),
		mutationFn: async (variables: TVariables): Promise<TData> => {
			const client = options.clientAccessor.getOrCreateAnonymousClient();
			return mutationFn(client, variables);
		},
		onError: composeOnError<TError>(
			localOnError,
			makeErrorHandler<TError>('auth', mergedHandlers),
		),
		...restOptions,
	};
};
