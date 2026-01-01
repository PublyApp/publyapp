import { createUntypedString } from '@microsoft/kiota-abstractions';
import _ from 'lodash';
import {
	createMutation,
	createQuery,
	createSuspenseQuery,
} from 'react-query-kit';

import { clientManager } from '@/front/lib/js-client/client-manager';
import { isJsClientError } from '@/front/lib/js-client/js-client-error';
import type { ApiClient } from '@/js-client/src/apiClient';
import type { VerifyEmailRequestBody } from '@/js-client/src/models';
import { logger } from '@/shared/lib/logger/iso-logger';

import { getQueryKey } from '../../query-utils';

const getUserAuthDataQueryKey = getQueryKey<ApiClient>(
	(client) => client.auth.userAuthData.get,
);

export const useGetUserAuthData = createSuspenseQuery({
	queryKey: [getUserAuthDataQueryKey] as const,
	fetcher: async () => {
		const result = await clientManager.apiClient.auth.userAuthData.get();
		if (_.isNil(result)) {
			throw new Error(`[${getUserAuthDataQueryKey}]: result is nil`);
		}
		return result;
	},
	// Custom retry logic to prevent infinite API calls on auth failures
	// When user is deleted/suspended or session is invalid, fail immediately
	// without retries to let ErrorBoundary handle the redirect
	retry: (failureCount, error) => {
		if (isJsClientError(error)) {
			const authErrorStatuses = [401, 403, 404];
			if (authErrorStatuses.includes(error.responseStatusCode)) {
				// Don't retry on auth errors - fail fast
				return false;
			}
		}
		// For other errors (network issues, etc.), retry up to 2 times
		return failureCount < 2;
	},
});

const getTenantAuthDataQueryKey = getQueryKey<ApiClient>(
	(client) => client.auth.tenantAuthData.get,
);

export const useGetTenantAuthData = createSuspenseQuery({
	queryKey: [getTenantAuthDataQueryKey] as const,
	fetcher: async ({ tenantId }: { tenantId: string }) => {
		const result = await clientManager.apiClient.auth.tenantAuthData.get({
			queryParameters: {
				tenantId,
			},
		});
		if (_.isNil(result)) {
			throw new Error(`[${getTenantAuthDataQueryKey}]: result is nil`);
		}
		return result;
	},
	// Custom retry logic to prevent infinite API calls on auth failures
	// When user is deleted/suspended or session is invalid, fail immediately
	// without retries to let ErrorBoundary handle the redirect
	retry: (failureCount, error) => {
		if (isJsClientError(error)) {
			const authErrorStatuses = [401, 403, 404];
			if (authErrorStatuses.includes(error.responseStatusCode)) {
				// Don't retry on auth errors - fail fast
				return false;
			}
		}
		// For other errors (network issues, etc.), retry up to 2 times
		return failureCount < 2;
	},
});

const getVerificationLinkQueryKey = getQueryKey<ApiClient>(
	(client) => client.auth.verificationLink.get,
);

export const useGetVerificationLink = createQuery({
	queryKey: [getVerificationLinkQueryKey] as const,
	fetcher: async ({ userId }: { userId: string }) => {
		const result = await clientManager.apiClient.auth.verificationLink.get({
			queryParameters: {
				userId,
			},
		});
		if (_.isNil(result)) {
			throw new Error(`[${getVerificationLinkQueryKey}]: result is nil`);
		}
		return result;
	},
});

const getRedirectCodeQueryKey = getQueryKey<ApiClient>(
	(client) => client.auth.redirectCode.get,
);

export const useGetRedirectCode = createQuery({
	queryKey: [getRedirectCodeQueryKey] as const,
	fetcher: async ({ tenantId }: { tenantId?: string }) => {
		const result = await clientManager.apiClient.auth.redirectCode.get({
			queryParameters: {
				tenantId,
			},
		});
		if (_.isNil(result)) {
			throw new Error(`[${getRedirectCodeQueryKey}]: result is nil`);
		}
		logger.debug('🔍🔍🔍🔍', { result });
		return result;
	},
});

const getVerifyEmailRequestQueryKey = getQueryKey<ApiClient>(
	(client) => client.auth.verifyEmailRequest.post,
);

export const useSendEmailVerificationReminder = createMutation({
	mutationKey: [getVerifyEmailRequestQueryKey] as const,
	mutationFn: async ({ email }: { email: string }) => {
		const body: VerifyEmailRequestBody = {
			email: createUntypedString(email) as typeof body.email,
		};
		const result =
			await clientManager.apiClient.auth.verifyEmailRequest.post(body);
		if (_.isNil(result)) {
			throw new Error(`[${getVerifyEmailRequestQueryKey}]: result is nil`);
		}
		return result;
	},
});

const getUserTenantsQueryKey = getQueryKey<ApiClient>(
	(client) => client.auth.userTenants.get,
);

export const useGetUserTenants = createQuery({
	queryKey: [getUserTenantsQueryKey] as const,
	fetcher: async () => {
		const result = await clientManager.apiClient.auth.userTenants.get();
		if (_.isNil(result)) {
			throw new Error(`[${getUserTenantsQueryKey}]: result is nil`);
		}
		return result;
	},
});
