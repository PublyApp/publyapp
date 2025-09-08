import {
	createMutation,
	createQuery,
	createSuspenseQuery,
} from 'react-query-kit';
import { clientManager } from '@/front/lib/js-client/client-manager';

export const useGetUserAuthData = createSuspenseQuery({
	queryKey: [
		clientManager.anonymousClient.auth.userAuthData.toGetRequestInformation()
			.URL,
	] as const,
	fetcher: async () => {
		return clientManager.apiClient.auth.userAuthData.get();
	},
});

export const useGetTenantAuthData = createSuspenseQuery({
	queryKey: [
		clientManager.anonymousClient.auth.tenantAuthData.toGetRequestInformation()
			.URL,
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

export const useGetVerificationLink = createQuery({
	queryKey: [
		clientManager.anonymousClient.auth.verificationLink.toPostRequestInformation()
			.URL,
	] as const,
	fetcher: async ({ userId }: { userId: string }) => {
		return clientManager.apiClient.auth.verificationLink.get({
			userId: {
				getValue() {
					return userId;
				},
			},
		});
	},
});

export const useSendEmailVerificationReminder = createMutation({
	mutationKey: [
		clientManager.anonymousClient.auth.verifyEmailRequest.toPostRequestInformation(
			{
				email: {
					getValue() {
						return '';
					},
				},
			},
		).URL,
	] as const,
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
