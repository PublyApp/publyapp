import { defaultApiClient } from '@/parse-api-client/ApiClient';
import type { CreateTenantParams } from '@/parse-api-client/features/tenant/tenant.endpoints';
import { functionName } from '@/shared/lib/constants';
import { createMutation } from 'react-query-kit';

export const useCreateTenant = createMutation({
	mutationKey: [functionName.staff.tenant.create] as const,
	mutationFn: async (params: CreateTenantParams) => {
		return defaultApiClient.tenant.createTenant(params);
	},
});
