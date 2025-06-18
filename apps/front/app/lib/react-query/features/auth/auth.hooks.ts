import { functionName } from '@/shared/lib/constants';
import { defaultApiClient } from 'packages/api/ApiClient';
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

export const useCheckEmailVerificationToken = createQuery({
	queryKey: [functionName.auth.checkEmailVerificationToken],
	fetcher: async ({ token }: { token: string }) => {
		return defaultApiClient.auth.checkEmailVerificationToken({ token });
	},
});
