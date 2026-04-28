import { createUntypedString } from '@microsoft/kiota-abstractions';
import isNil from 'lodash/isNil';
import type { CreateQueryOptions } from 'react-query-kit';

import type { VerifyEmailRequestBody } from '@org/client-ts/src/models';

import { toApiFailure } from '#app/lib/api-failure/index.ts';
import { setCurrentUserIdForTenantHint } from '#app/lib/react-query/query-client.tsx';

import {
	createAuthMutation,
	createAuthQuery,
	createAuthSuspenseQuery,
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
		if (isNil(result)) {
			throw new Error('useGetUserAuthData: result is nil');
		}
		setCurrentUserIdForTenantHint(result.id ?? undefined);
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
		if (isNil(result)) {
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
		if (isNil(result)) {
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
		if (isNil(result)) {
			throw new Error('useSendEmailVerificationReminder: result is nil');
		}
		return result;
	},
});

export const useGetUserTenants = createAuthQuery({
	queryKeyFn: (client) => client.auth.userTenants.get,
	fetcher: async (client) => {
		const result = await client.auth.userTenants.get();
		if (isNil(result)) {
			throw new Error('useGetUserTenants: result is nil');
		}
		return result;
	},
});

export const useGetUserTenantsForPicker = createAuthQuery({
	queryKeyFn: (client) => client.auth.tenantsForPicker.get,
	fetcher: async (client) => {
		const result = await client.auth.tenantsForPicker.get();
		if (isNil(result)) {
			throw new Error('useGetUserTenantsForPicker: result is nil');
		}
		return result;
	},
});
