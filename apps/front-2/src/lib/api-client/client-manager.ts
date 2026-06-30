import { AnonymousAuthenticationProvider } from '@microsoft/kiota-abstractions';
import {
	FetchRequestAdapter,
	KiotaClientFactory,
} from '@microsoft/kiota-http-fetchlibrary';
import type { ApiClient } from '@org/client-ts/src/apiClient';
import { createApiClient } from '@org/client-ts/src/apiClient';
import * as cookie from 'cookie';

import {
	SESSION_TOKEN_COOKIE_KEY,
	TENANT_ID_HEADER_KEY,
} from '@org/shared-ts/lib/constants';
import { parseSessionCookie, selectToken } from '@org/shared-ts/lib/session/parse';
import type { ClientAccessor } from '@org/shared-ts/lib/query/types';
import type { ParsedSessionTokens } from '@org/shared-ts/lib/session/parse';

type SessionScope = 'tenant' | 'staff';
type FetchFunction = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

type BuildCustomFetchOptions = {
	getSessionToken: () => string | undefined;
	tenantId?: string;
	fetchImpl?: FetchFunction;
};

const normalizeTenantId = (tenantId: string): string => {
	const normalized = tenantId.trim();
	if (!normalized) {
		throw new Error('tenantId is required to create tenant-scoped client');
	}

	return normalized;
};

const resolveSessionToken = (
	scope: SessionScope = 'tenant',
): string | undefined => {
	if (typeof document === 'undefined') {
		return undefined;
	}

	const cookies = cookie.parse(document.cookie ?? '');
	const rawCookie = cookies[SESSION_TOKEN_COOKIE_KEY];
	if (!rawCookie) {
		return undefined;
	}

	return selectToken(parseSessionCookie(rawCookie), scope);
};

const buildCustomFetch = (options: BuildCustomFetchOptions): FetchFunction => {
	const fetchImpl = options.fetchImpl ?? globalThis.fetch;
	if (typeof fetchImpl !== 'function') {
		throw new Error('fetch is required in the current runtime');
	}

	return (input, init) => {
		const headers = new Headers(init?.headers);
		const sessionToken = options.getSessionToken();
		const tenantId = options.tenantId;

		if (sessionToken) {
			headers.set('X-Session-Token', sessionToken);
		}
		if (tenantId) {
			headers.set(TENANT_ID_HEADER_KEY, tenantId);
		}

		return fetchImpl(input, { ...init, headers });
	};
};

const resolveApiBaseUrl = (): string => {
	const runtimeBase =
		typeof globalThis === 'object'
			? (globalThis as { __ENV__?: { PUBLIC_API_BASE_URL?: string } })
					.__ENV__?.PUBLIC_API_BASE_URL
			: undefined;
	if (runtimeBase) {
		return runtimeBase;
	}

	type ProcessEnv = { [key: string]: string | undefined };
	type ProcessLike = { env?: ProcessEnv };
	type GlobalLike = { process?: ProcessLike; __ENV__?: { PUBLIC_API_BASE_URL?: string } };

	const globalLike = typeof globalThis === 'object'
		? (globalThis as GlobalLike)
		: undefined;

	const processBase =
		globalLike?.process?.env?.PUBLIC_API_BASE_URL ||
		globalLike?.process?.env?.NEXT_PUBLIC_API_BASE_URL;

	if (processBase) {
	return processBase;
	}

	if (typeof window === 'undefined') {
		return 'http://127.0.0.1:5000';
	}
	throw new Error('__ENV__.PUBLIC_API_BASE_URL is required in front-2 runtime env');
};

const buildClient = (options: {
	getSessionToken: () => string | undefined;
	tenantId?: string;
	fetchImpl?: FetchFunction;
}): ApiClient => {
	const customFetch = buildCustomFetch(options);
	const adapter = new FetchRequestAdapter(
		new AnonymousAuthenticationProvider(),
		undefined,
		undefined,
		KiotaClientFactory.create(customFetch),
	);

	adapter.baseUrl = resolveApiBaseUrl();
	return createApiClient(adapter);
};

const getSessionTokensFromBrowser = (): ParsedSessionTokens => {
	if (typeof document === 'undefined') {
		return {};
	}

	const rawCookieValue = cookie.parse(document.cookie ?? '')[SESSION_TOKEN_COOKIE_KEY];
	if (!rawCookieValue) {
		return {};
	}

	return parseSessionCookie(rawCookieValue);
};

class ClientManager implements ClientAccessor<ApiClient> {
	private tenantClientMap = new Map<string, ApiClient>();
	private staffClient: ApiClient | undefined;
	private anonymousClient: ApiClient | undefined;

	getOrCreateClient(tenantId: string): ApiClient {
		const safeTenantId = normalizeTenantId(tenantId);

		const cached = this.tenantClientMap.get(safeTenantId);
		if (cached) {
			return cached;
		}

		const apiClient = buildClient({
			getSessionToken: () => resolveSessionToken('tenant'),
			tenantId: safeTenantId,
		});

		this.tenantClientMap.set(safeTenantId, apiClient);
		return apiClient;
	}

	getOrCreateStaffClient(): ApiClient {
		if (this.staffClient) {
			return this.staffClient;
		}

		this.staffClient = buildClient({
			getSessionToken: () => resolveSessionToken('staff'),
		});
		return this.staffClient;
	}

	getOrCreateAnonymousClient(): ApiClient {
		if (this.anonymousClient) {
			return this.anonymousClient;
		}

		this.anonymousClient = buildClient({
			getSessionToken: () => undefined,
		});
		return this.anonymousClient;
	}

	clearClients(): void {
		this.tenantClientMap.clear();
		this.staffClient = undefined;
		this.anonymousClient = undefined;
	}
}

let clientManager: ClientManager | undefined;

export const getClientManager = (): ClientManager => {
	clientManager = clientManager ?? new ClientManager();
	return clientManager;
};

export const resetClientManager = (): void => {
	clientManager?.clearClients();
	clientManager = undefined;
};

export {
	getSessionTokensFromBrowser,
	resolveSessionToken,
	buildClient as createClient,
	buildCustomFetch,
	getClientManager,
	resetClientManager,
};
