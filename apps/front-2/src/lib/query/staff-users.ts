import { useQuery } from '@tanstack/react-query';
import { getClientManager } from '~/lib/api-client/client-manager';
import type { SortOrder } from '~/lib/url-state/table-search-params';

import type { ApiClient } from '@org/client-ts/src/apiClient';
import type { FindStaffUsersResponse } from '@org/client-ts/src/models/index.js';
import { buildStaffQueryOptions } from '@org/shared-ts/lib/query/create-hooks';

export type StaffUsersQueryVariables = {
	q?: string;
	sortId?: string;
	sortOrder?: SortOrder;
	cursor?: string;
	size?: number;
};

const staffUsersQueryOptions = buildStaffQueryOptions<
	ApiClient,
	FindStaffUsersResponse,
	StaffUsersQueryVariables
>(
	{
		queryKeyFn: () => ['staff-users'],
		fetcher: async (client, vars) => {
			const result = await client.staff.users.get({
				queryParameters: {
					q: vars.q,
					sortId: vars.sortId,
					sortOrder: vars.sortOrder,
					cursor: vars.cursor,
					limit: vars.size === undefined ? undefined : String(vars.size),
				},
			});

			if (!result) {
				throw new Error('staff users result was empty');
			}

			return result;
		},
	},
	{ clientAccessor: getClientManager() },
);

export const useStaffUsersQuery = (variables: StaffUsersQueryVariables) =>
	useQuery({
		queryKey: staffUsersQueryOptions.queryKey(variables),
		queryFn: () => staffUsersQueryOptions.fetcher(variables),
	});
