import {
	createMutation,
	createQuery,
	createSuspenseQuery,
} from 'react-query-kit';
import { clientManager } from '@/front/lib/js-client/client-manager';
import { defaultApiClient } from '@/parse-api-client/ApiClient';
import { functionName } from '@/shared/lib/constants';

export const useGetUserAuthData = createSuspenseQuery({
	queryKey: [functionName.auth.getUserAuthData] as const,
	fetcher: async () => {
		// return defaultApiClient.auth.getUserAuthData();
		return clientManager.apiClient.auth.userAuthData.get();
	},
});

export const useGetTenantAuthData = createSuspenseQuery({
	queryKey: [functionName.auth.getTenantAuthData] as const,
	fetcher: async ({ tenantId }: { tenantId: string }) => {
		// return defaultApiClient.auth.getTenantAuthData({ tenantId });
		return {
			permissions: ['*'],
		};
	},
});

export const useGetVerificationLink = createQuery({
	queryKey: [functionName.auth.getVerificationLink] as const,
	fetcher: async ({ userId }: { userId: string }) => {
		return defaultApiClient.auth.getVerificationLink({ userId });
	},
});

export const useSendEmailVerificationReminder = createMutation({
	mutationKey: [
		`${functionName.auth.requestEmailVerification}-reminder`,
	] as const,
	mutationFn: async ({ email }: { email: string }) => {
		return defaultApiClient.auth.requestEmailVerification({ email });
	},
});
