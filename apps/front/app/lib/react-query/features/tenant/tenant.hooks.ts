import { createMutation, createQuery } from 'react-query-kit';
import { _tenantProfiles } from '@/front/_mock/_tenant-profiles';
import { defaultApiClient } from '@/parse-api-client/ApiClient';
import type { CreateTenantParams } from '@/parse-api-client/features/tenant/tenant.endpoints';
import { functionName } from '@/shared/lib/constants';
import { delay } from '@/shared/utils/any.utils';

export const useCreateTenant = createMutation({
	mutationKey: [functionName.staff.tenant.create] as const,
	mutationFn: async (params: CreateTenantParams) => {
		return defaultApiClient.tenant.createTenant(params);
	},
});

type GetTenantParams = {
	tenantId: string;
};

export const useGetTenant = createQuery({
	queryKey: [functionName.staff.tenant.get] as const,
	fetcher: async (params: GetTenantParams) => {
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

export const useFindTenantProfiles = createQuery({
	queryKey: [functionName.staff.tenant.findProfiles] as const,
	fetcher: async (_params: FindTenantProfilesParams) => {
		await delay(5_000);
		return _tenantProfiles;
	},
});
