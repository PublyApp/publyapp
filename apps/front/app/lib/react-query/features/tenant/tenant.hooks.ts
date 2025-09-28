import { createMutation, createQuery } from 'react-query-kit';
import { _tenantProfiles } from '@/front/_mock/_tenant-profiles';
import { clientManager } from '@/front/lib/js-client/client-manager';
import type { ApiClient } from '@/js-client/src/apiClient';
// import { defaultApiClient } from '@/parse-api-client/ApiClient';
// import type { CreateTenantParams } from '@/parse-api-client/features/tenant/tenant.endpoints';
// import { functionName } from '@/shared/lib/constants';
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
		await delay(5_000);
		return {
			id: params.tenantId,
			name: `Tenant 1 - ${params.tenantId}`,
			logo: 'https://via.placeholder.com/150',
			maxUsers: 1000,
		};
		// return defaultApiClient.tenant.getTenant(params);
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
