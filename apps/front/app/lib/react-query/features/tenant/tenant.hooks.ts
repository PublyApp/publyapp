import _ from 'lodash';
import { createMutation, createQuery } from 'react-query-kit';
import { _tenantProfiles } from '@/front/_mock/_tenant-profiles';
import { clientManager } from '@/front/lib/js-client/client-manager';
import type { ApiClient } from '@/js-client/src/apiClient';
import { delay } from '@/shared/utils/any.utils';
import { getQueryKey } from '../../query-utils';

const createTenantMutationKey = getQueryKey<ApiClient>(
	(client) => client.staff.tenants.post,
);

export const useCreateTenant = createMutation({
	mutationKey: [createTenantMutationKey] as const,
	mutationFn: async (params: { name: string }) => {
		return clientManager.apiClient.staff.tenants.post({
			name: {
				getValue() {
					return params.name;
				},
			},
		});
	},
});

const getTenantQueryKey = getQueryKey<ApiClient>(
	(client) => client.staff.tenants.byTenantId('').get,
);

export const useGetTenant = createQuery({
	queryKey: [getTenantQueryKey] as const,
	fetcher: async (params: { tenantId: string }) => {
		const result = await clientManager.apiClient.staff.tenants
			.byTenantId(params.tenantId)
			.get();
		if (_.isNil(result)) {
			throw new Error(`[${getTenantQueryKey}]: result is nil`);
		}
		return result;
	},
});

type FindTenantProfilesParams = {
	tenantId: string;
};

const findTenantProfilesQueryKey = getQueryKey<ApiClient>(
	(client) => client.staff.tenants.get,
);

export const useFindTenantProfiles = createQuery({
	queryKey: [findTenantProfilesQueryKey] as const,
	fetcher: async (_params: FindTenantProfilesParams) => {
		await delay(5_000);
		return _tenantProfiles;
	},
});
