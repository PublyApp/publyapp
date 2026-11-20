import { createUntypedString } from '@microsoft/kiota-abstractions';
import {
	type QueryClient,
	useMutation,
	useQuery,
	useQueryClient,
} from '@tanstack/react-query';
import { getClientManager } from '~/lib/api-client/client-manager';

import type { ApiClient } from '@org/client-ts/apiClient';
import type { FindAggregatorsForTenantResponse } from '@org/client-ts/models/index';
import { buildTenantQueryOptions } from '@org/shared-ts/lib/query/create-hooks';

const AGGREGATORS_QUERY_KEY = ['tenant-aggregators'] as const;

/** One aggregator the organisation can connect, as the API describes it: the
 * name, help link and platforms come from the adapter, never from this front. */
export type AggregatorRow = {
	kind: string;
	displayName: string;
	keyHelpUrl: string;
	supportedPlatforms: string[];
	connection: {
		isActive: boolean;
		keyHint: string;
		lastCheckedAt: Date | null;
		lastError: string | null;
	} | null;
};

export const toAggregatorRows = (
	response: FindAggregatorsForTenantResponse | null | undefined,
): AggregatorRow[] =>
	(response?.aggregators ?? []).map((item) => ({
		kind: item.kind ?? '',
		displayName: item.displayName ?? '',
		keyHelpUrl: item.keyHelpUrl ?? '',
		supportedPlatforms: item.supportedPlatforms ?? [],
		// The generated client can hand back an empty object for `connection: null`.
		connection: item.connection?.status
			? {
					isActive: item.connection.status === 'active',
					keyHint: item.connection.keyHint ?? '',
					lastCheckedAt: item.connection.lastCheckedAt ?? null,
					lastError: item.connection.lastError ?? null,
				}
			: null,
	}));

export const aggregatorsQueryOptions = buildTenantQueryOptions<
	ApiClient,
	FindAggregatorsForTenantResponse,
	{ tenantId: string }
>(
	{
		queryKeyFn: () => [...AGGREGATORS_QUERY_KEY],
		fetcher: async (client) => {
			const result = await client.aggregators.get();
			if (!result) {
				throw new Error('aggregators result was empty');
			}

			return result;
		},
	},
	{ clientAccessor: getClientManager() },
);

export const useAggregatorsQuery = (variables: { tenantId: string }) =>
	useQuery({
		queryKey: aggregatorsQueryOptions.queryKey(variables),
		queryFn: () => aggregatorsQueryOptions.fetcher(variables),
	});

export const invalidateAggregators = (
	queryClient: QueryClient,
	tenantId: string,
): void => {
	void queryClient.invalidateQueries({
		queryKey: aggregatorsQueryOptions.queryKey({ tenantId }),
	});
};

type KeyInput = { tenantId: string; kind: string };

/** Save or rotate the key: the API checks it with the aggregator first. The key
 * only ever lives in form state and in this one request. */
export const useSaveAggregatorKeyMutation = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationKey: [...AGGREGATORS_QUERY_KEY, 'save'],
		mutationFn: async ({
			tenantId,
			kind,
			apiKey,
		}: KeyInput & { apiKey: string }) => {
			const client = getClientManager().getOrCreateClient(tenantId);
			await client.aggregators.byKind(kind).connection.put({
				apiKey: createUntypedString(apiKey),
			});
		},
		onSuccess: (_data, variables) =>
			invalidateAggregators(queryClient, variables.tenantId),
		meta: {
			successMessage: 'aggregator-key-saved',
			validationHandledByForm: true,
		},
	});
};

export const useTestAggregatorKeyMutation = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationKey: [...AGGREGATORS_QUERY_KEY, 'test'],
		mutationFn: async ({ tenantId, kind }: KeyInput) => {
			const client = getClientManager().getOrCreateClient(tenantId);
			await client.aggregators.byKind(kind).connection.check.post();
		},
		onSuccess: (_data, variables) =>
			invalidateAggregators(queryClient, variables.tenantId),
		meta: { successMessage: 'aggregator-key-checked' },
	});
};

export const useRemoveAggregatorKeyMutation = () => {
	const queryClient = useQueryClient();

	return useMutation({
		mutationKey: [...AGGREGATORS_QUERY_KEY, 'remove'],
		mutationFn: async ({ tenantId, kind }: KeyInput) => {
			const client = getClientManager().getOrCreateClient(tenantId);
			await client.aggregators.byKind(kind).connection.delete();
		},
		onSuccess: (_data, variables) =>
			invalidateAggregators(queryClient, variables.tenantId),
		meta: { successMessage: 'aggregator-connection-removed-success' },
	});
};
