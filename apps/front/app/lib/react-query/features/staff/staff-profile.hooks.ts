import _ from 'lodash';
import { createQuery } from 'react-query-kit';
import { clientManager } from '@/front/lib/js-client/client-manager';
import type { ApiClient } from '@/js-client/src/apiClient';
import { getQueryKey } from '../../query-utils';

type FindStaffProfilesParams = {
	cursor?: string;
	limit?: number;
	sort?: { id: string; order: 'desc' | 'asc' };
};

const findStaffProfilesQueryKey = getQueryKey<ApiClient>(
	(client) => client.staff.profiles.get,
);

export const useFindStaffProfiles = createQuery({
	queryKey: [findStaffProfilesQueryKey] as const,
	fetcher: async (params: FindStaffProfilesParams) => {
		const result = await clientManager.apiClient.staff.profiles.get({
			queryParameters: {
				cursor: params.cursor,
				limit: params.limit ? params.limit.toString() : undefined,
				sortId: params.sort?.id,
				sortOrder: params.sort?.order,
			},
		});

		if (_.isNil(result)) {
			throw new Error(`[${findStaffProfilesQueryKey}] result is nil`);
		}

		return result;
	},
});
