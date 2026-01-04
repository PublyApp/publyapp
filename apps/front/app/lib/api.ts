import { AnonymousAuthenticationProvider } from '@microsoft/kiota-abstractions';
import {
	FetchRequestAdapter,
	KiotaClientFactory,
} from '@microsoft/kiota-http-fetchlibrary';

import { type ApiClient, createApiClient } from '@org/js-client/src/apiClient';
import {
	SESSION_TOKEN_HEADER_KEY,
	TENANT_ID_HEADER_KEY,
} from '@/shared/lib/constants';

import { env } from './env';

/**
 * Creates an API client for server-side usage.
 * Unlike client-side, session tokens must be explicitly provided (from request cookies).
 *
 * Note: For client-side usage, use clientManager directly:
 * - `clientManager.getOrCreateClient(tenantId)` - for tenant-scoped requests
 * - `clientManager.getStaffClient()` - for staff requests
 * - `clientManager.anonymousClient` - for public/anonymous requests
 */
export const initApiClientOnServer = ({
	sessionToken,
	tenantId,
}: {
	sessionToken?: string;
	tenantId?: string;
}): ApiClient => {
	// Custom fetch that injects session token and tenant ID headers
	const customFetch = (
		url: Parameters<typeof fetch>[0],
		init?: RequestInit,
	) => {
		return fetch(url, {
			...init,
			headers: {
				...init?.headers,
				...(sessionToken ? { [SESSION_TOKEN_HEADER_KEY]: sessionToken } : {}),
				...(tenantId ? { [TENANT_ID_HEADER_KEY]: tenantId } : {}),
			},
		});
	};

	const authProvider = new AnonymousAuthenticationProvider();
	const httpClient = KiotaClientFactory.create(customFetch);
	const adapter = new FetchRequestAdapter(
		authProvider,
		undefined,
		undefined,
		httpClient,
	);
	adapter.baseUrl = env.VITE_ASP_SERVER_URL;
	return createApiClient(adapter);
};
