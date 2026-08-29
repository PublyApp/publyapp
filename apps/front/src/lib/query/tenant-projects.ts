import { useQuery } from '@tanstack/react-query';
import { getClientManager } from '~/lib/api-client/client-manager';

import type { ApiClient } from '@org/client-ts/apiClient';
import type { FindProjectsForTenantResponse } from '@org/client-ts/models/index';
import { buildTenantQueryOptions } from '@org/shared-ts/lib/query/create-hooks';

export type TenantProjectListItem = {
	id: string;
	name: string;
};

/** @internal Unscoped — use via `scopedKey('tenant', …)`. */
const TENANT_PROJECTS_QUERY_KEY = ['tenant-projects'] as const;

const normalizeString = (
	value: string | null | undefined,
): string | undefined => {
	if (typeof value !== 'string') {
		return undefined;
	}

	const trimmed = value.trim();
	if (trimmed.length > 0) {
		return trimmed;
	}
	return undefined;
};

export const toTenantProjectItems = (
	result: FindProjectsForTenantResponse | null | undefined,
): TenantProjectListItem[] => {
	const items: TenantProjectListItem[] = [];

	for (const item of result?.items ?? []) {
		const id = normalizeString(item.id?.toString());
		const name = normalizeString(item.name);

		if (!id || !name) {
			continue;
		}

		items.push({ id, name });
	}

	return items;
};

const tenantProjectsQueryOptions = buildTenantQueryOptions<
	ApiClient,
	FindProjectsForTenantResponse,
	{ tenantId: string }
>(
	{
		queryKeyFn: () => [...TENANT_PROJECTS_QUERY_KEY],
		fetcher: async (client) => {
			const result = await client.projects.get();

			if (!result) {
				throw new Error('tenant projects result was empty');
			}

			return result;
		},
	},
	{ clientAccessor: getClientManager() },
);

export const useTenantProjectsQuery = (variables: { tenantId: string }) =>
	useQuery({
		queryKey: tenantProjectsQueryOptions.queryKey(variables),
		queryFn: () => tenantProjectsQueryOptions.fetcher(variables),
	});
