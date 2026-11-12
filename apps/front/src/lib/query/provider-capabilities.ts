import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { getClientManager } from '~/lib/api-client/client-manager';

import type { ApiClient } from '@org/client-ts/apiClient';
import type { GetProviderCapabilitiesForTenantResponse } from '@org/client-ts/models/index';
import { buildTenantQueryOptions } from '@org/shared-ts/lib/query/create-hooks';

/** @internal Unscoped — `scopedKey('tenant', …)` + tenantId is the only way to
 * build an invalidation/removal key from this. */
export const PROVIDER_CAPABILITIES_QUERY_KEY = [
	'provider-capabilities',
] as const;

type ProviderCapabilitiesQueryVariables = { tenantId: string };

/** `GET /publishing/capabilities`: what each provider accepts and whether the
 * operator lets tenants connect it (#2184). */
export const providerCapabilitiesQueryOptions = buildTenantQueryOptions<
	ApiClient,
	GetProviderCapabilitiesForTenantResponse,
	ProviderCapabilitiesQueryVariables
>(
	{
		queryKeyFn: () => [...PROVIDER_CAPABILITIES_QUERY_KEY],
		fetcher: async (client) => {
			const result = await client.publishing.capabilities.get();
			if (!result) {
				throw new Error('provider capabilities result was empty');
			}

			return result;
		},
	},
	{ clientAccessor: getClientManager() },
);

/** The providers the operator switched off, for the current workspace tenant;
 * empty until the answer is known (see `toDisabledProviders`). */
export const useDisabledProviders = (
	tenantId: string | null,
): ReadonlySet<string> => {
	const query = useQuery({
		// The tenant factory refuses an empty tenant id, so no tenant uses a
		// placeholder key and the query stays disabled.
		queryKey:
			tenantId === null
				? [...PROVIDER_CAPABILITIES_QUERY_KEY, 'no-tenant']
				: providerCapabilitiesQueryOptions.queryKey({ tenantId }),
		queryFn: () =>
			providerCapabilitiesQueryOptions.fetcher({ tenantId: tenantId ?? '' }),
		enabled: tenantId !== null,
	});

	// Stable while the answer is unchanged: callers use it as a memo dependency.
	return useMemo(() => toDisabledProviders(query.data), [query.data]);
};

/** Wire names of the providers the operator switched off. Fail-open: with no
 * answer yet nothing is hidden, the connect endpoints still refuse a disabled
 * provider, so a late answer only removes a button that would have failed. */
export const toDisabledProviders = (
	data: GetProviderCapabilitiesForTenantResponse | null | undefined,
): ReadonlySet<string> => {
	const disabled = new Set<string>();

	for (const item of data?.items ?? []) {
		if (item?.enabled === false && typeof item.provider === 'string') {
			disabled.add(item.provider);
		}
	}

	return disabled;
};
