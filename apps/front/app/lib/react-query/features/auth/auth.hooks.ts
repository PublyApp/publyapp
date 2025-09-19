import {
	createMutation,
	createQuery,
	createSuspenseQuery,
} from 'react-query-kit';
import { clientManager } from '@/front/lib/js-client/client-manager';
import type { ApiClient } from '@/js-client/src/apiClient';
import { getQueryKey } from '../../query-utils';

const getUserAuthDataQueryKey = getQueryKey<ApiClient>(
	(client) => client.auth.userAuthData.get,
);

export const useGetUserAuthData = createSuspenseQuery({
	queryKey: [getUserAuthDataQueryKey] as const,
	fetcher: async () => {
		return clientManager.apiClient.auth.userAuthData.get();
	},
});

export const useGetTenantAuthData = createSuspenseQuery({
	queryKey: [
		getQueryKey<ApiClient>((client) => client.auth.tenantAuthData.get),
	] as const,
	fetcher: async ({ tenantId }: { tenantId: string }) => {
		return clientManager.apiClient.auth.tenantAuthData.get({
			tenantId: {
				getValue() {
					return tenantId;
				},
			},
		});
		// return {
		// 	permissions: ['*'],
		// };
	},
});

const getVerificationLinkQueryKey = getQueryKey<ApiClient>(
	(client) => client.auth.verificationLink.get,
);

export const useGetVerificationLink = createQuery({
	queryKey: [getVerificationLinkQueryKey] as const,
	fetcher: async ({ userId }: { userId: string }) => {
		return clientManager.apiClient.auth.verificationLink.get({
			queryParameters: {
				userId,
			},
		});
	},
});

const getVerifyEmailRequestQueryKey = getQueryKey<ApiClient>(
	(client) => client.auth.verifyEmailRequest.post,
);

export const useSendEmailVerificationReminder = createMutation({
	mutationKey: [getVerifyEmailRequestQueryKey] as const,
	mutationFn: async ({ email }: { email: string }) => {
		return clientManager.apiClient.auth.verifyEmailRequest.post({
			email: {
				getValue() {
					return email;
				},
			},
		});
	},
});
