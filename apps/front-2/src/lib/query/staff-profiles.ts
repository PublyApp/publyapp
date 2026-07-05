import { useQuery } from '@tanstack/react-query';
import { getClientManager } from '~/lib/api-client/client-manager';
import type { SortOrder } from '~/lib/url-state/table-search-params';

import type { ApiClient } from '@org/client-ts/src/apiClient';
import type { FindStaffProfilesResult } from '@org/client-ts/src/models/index.js';
import { buildStaffQueryOptions } from '@org/shared-ts/lib/query/create-hooks';

export type StaffProfilesQueryVariables = {
	q?: string;
	sortId?: string;
	sortOrder?: SortOrder;
	cursor?: string;
	limit?: number;
};

const staffProfilesQueryOptions = buildStaffQueryOptions<
	ApiClient,
	FindStaffProfilesResult,
	StaffProfilesQueryVariables
>(
	{
		queryKeyFn: () => ['staff-profiles'],
		fetcher: async (client, vars) => {
			const result = await client.staff.profiles.get({
				queryParameters: {
					q: vars.q,
					sortId: vars.sortId,
					sortOrder: vars.sortOrder,
					cursor: vars.cursor,
					limit: vars.limit === undefined ? undefined : String(vars.limit),
				},
			});

			if (!result) {
				throw new Error('staff profiles result was empty');
			}

			return result;
		},
	},
	{ clientAccessor: getClientManager() },
);

export const useStaffProfilesQuery = (variables: StaffProfilesQueryVariables) =>
	useQuery({
		queryKey: staffProfilesQueryOptions.queryKey(variables),
		queryFn: () => staffProfilesQueryOptions.fetcher(variables),
	});
