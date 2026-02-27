import { createUntypedString } from '@microsoft/kiota-abstractions';
import _ from 'lodash';
import type { CreateQueryOptions } from 'react-query-kit';

import { toApiFailure } from '@/front/lib/api-failure';
import type { VerifyEmailRequestBody } from '@org/client-ts/src/models';

import {
	createAuthMutation,
	createAuthQuery,
	createAuthSuspenseQuery,
	createTenantSuspenseQuery,
} from '../../create-hooks';

// Custom retry logic for auth failures - fail fast on auth errors
const authRetry: CreateQueryOptions['retry'] = (
	failureCount: number,
	error: Error,
) => {
	const failure = toApiFailure(error);

	if (failure.kind === 'problem') {
		const authErrorStatuses = [401, 403, 404];
		if (authErrorStatuses.includes(failure.status)) {
			// Don't retry on auth errors - fail fast
			return false;
		}
	}

	// Never retry aborts
	if (failure.kind === 'abort') {
		return false;
	}

	// For other errors (network issues, etc.), retry up to 2 times
	return failureCount < 2;
};

export const useGetUserAuthData = createAuthSuspenseQuery({
	queryKeyFn: (client) => client.auth.userAuthData.get,
	fetcher: async (client) => {
		const result = await client.auth.userAuthData.get();
		if (_.isNil(result)) {
			throw new Error('useGetUserAuthData: result is nil');
		}
		return result;
	},
	retry: authRetry,
});

// This hook needs tenantId (query param), and we also use the tenant client so the tenant header is set.
export const useGetTenantAuthData = createTenantSuspenseQuery({
	queryKeyFn: (client) => client.auth.tenantAuthData.get,
	fetcher: async (client, { tenantId }) => {
		const result = await client.auth.tenantAuthData.get({
			queryParameters: {
				tenantId,
			},
		});
		if (_.isNil(result)) {
			throw new Error('useGetTenantAuthData: result is nil');
		}
		return result;
	},
	retry: authRetry,
});

export const useGetVerificationLink = createAuthQuery({
	queryKeyFn: (client) => client.auth.verificationLink.get,
	fetcher: async (client, { userId }: { userId: string }) => {
		const result = await client.auth.verificationLink.get({
			queryParameters: {
				userId,
			},
		});
		if (_.isNil(result)) {
			throw new Error('useGetVerificationLink: result is nil');
		}
		return result;
	},
});

export const useGetRedirectCode = createAuthQuery({
	queryKeyFn: (client) => client.auth.redirectCode.get,
	fetcher: async (client, { tenantId }: { tenantId?: string }) => {
		const result = await client.auth.redirectCode.get({
			queryParameters: {
				tenantId,
			},
		});
		if (_.isNil(result)) {
			throw new Error('useGetRedirectCode: result is nil');
		}
		return result;
	},
});

export const useSendEmailVerificationReminder = createAuthMutation({
	mutationKeyFn: (client) => client.auth.verifyEmailRequest.post,
	mutationFn: async (client, { email }: { email: string }) => {
		const body: VerifyEmailRequestBody = {
			email: createUntypedString(email) as typeof body.email,
		};
		const result = await client.auth.verifyEmailRequest.post(body);
		if (_.isNil(result)) {
			throw new Error('useSendEmailVerificationReminder: result is nil');
		}
		return result;
	},
});

export const useGetUserTenants = createAuthQuery({
	queryKeyFn: (client) => client.auth.userTenants.get,
	fetcher: async (client) => {
		const result = await client.auth.userTenants.get();
		if (_.isNil(result)) {
			throw new Error('useGetUserTenants: result is nil');
		}
		return result;
	},
});

export const useGetUserTenantsForPicker = createAuthQuery({
	queryKeyFn: (client) => client.auth.tenantsForPicker.get,
	fetcher: async (client) => {
		const result = await client.auth.tenantsForPicker.get();
		if (_.isNil(result)) {
			throw new Error('useGetUserTenantsForPicker: result is nil');
		}
		return result;
	},
});
