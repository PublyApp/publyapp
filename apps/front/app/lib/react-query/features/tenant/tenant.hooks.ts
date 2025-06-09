import { functionName } from '@/shared/lib/constants';
import { defaultApiClient } from '@org/api/ApiClient';
import type { CreateTenantParams } from '@org/api/features/tenant/tenant.endpoints';
import { createMutation } from 'react-query-kit';

export const useCreateTenant = createMutation({
	mutationKey: [functionName.staff.tenant.create] as const,
	mutationFn: async (params: CreateTenantParams) => {
		return defaultApiClient.tenant.createTenant(params);
	},
});
