import { defaultApiClient } from '@/parse-api-client/ApiClient';
import { functionName } from '@/shared/lib/constants';
import { createQuery, createSuspenseQuery } from 'react-query-kit';

export const useGetUserAuthData = createSuspenseQuery({
	queryKey: [functionName.auth.getUserAuthData] as const,
	fetcher: async () => {
		return defaultApiClient.auth.getUserAuthData();
	},
});

export const useGetTenantAuthData = createSuspenseQuery({
	queryKey: [functionName.auth.getTenantAuthData] as const,
	fetcher: async ({ tenantId }: { tenantId: string }) => {
		return defaultApiClient.auth.getTenantAuthData({ tenantId });
	},
});

export const useGetVerificationLink = createQuery({
	queryKey: [functionName.auth.getVerificationLink] as const,
	fetcher: async ({ userId }: { userId: string }) => {
		return defaultApiClient.auth.getVerificationLink({ userId });
	},
});
