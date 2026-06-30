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

type CookieValueProvider = () => string | undefined;
type SessionTokenProvider = (scope: SessionScope) => string | undefined;

type BuildCustomFetchOptions = {
	getSessionToken: () => string | undefined;
	tenantId?: string;
	fetchImpl?: FetchFunction;
	apiBaseUrl: string;
};

type BuildClientOptions = {
	getSessionToken: () => string | undefined;
	tenantId?: string;
	fetchImpl?: FetchFunction;
};

type ClientManagerOptions = {
	sessionTokenProvider?: SessionTokenProvider;
};

const getDefaultCookieValue = (): string | undefined => {
	if (typeof document === 'undefined') {
		return undefined;
	}

	return document.cookie;
};

const normalizeTenantId = (tenantId: string): string => {
	const normalized = tenantId.trim();
	if (!normalized) {
		throw new Error('tenantId is required to create tenant-scoped client');
	}

	return normalized;
};

const defaultSessionTokenProvider: SessionTokenProvider = (scope) => {
	const rawCookieValue = getDefaultCookieValue();
	if (!rawCookieValue) {
		return undefined;
	}

	const parsedCookie = cookie.parse(rawCookieValue);
	const rawCookie = parsedCookie[SESSION_TOKEN_COOKIE_KEY];
	if (!rawCookie) {
		return undefined;
	}

	return selectToken(parseSessionCookie(rawCookie), scope);
};

let sessionTokenProvider: SessionTokenProvider = defaultSessionTokenProvider;

export const setSessionTokenProvider = (provider: SessionTokenProvider | undefined): void => {
	sessionTokenProvider = provider ?? defaultSessionTokenProvider;
};

const resolveSessionToken = (
	scope: SessionScope = 'tenant',
): string | undefined => sessionTokenProvider(scope);

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

	const globalLike =
		typeof globalThis === 'object' ? (globalThis as GlobalLike) : undefined;

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

const resolveRequestUrl = (input: RequestInfo | URL, baseUrl: string): URL => {
	if (typeof Request !== 'undefined' && input instanceof Request) {
		return new URL(input.url, baseUrl);
	}

	if (typeof input === 'string' || input instanceof URL) {
		return new URL(String(input), baseUrl);
	}

	throw new Error('Unsupported fetch RequestInfo in client adapter');
};

const isSameOrigin = (target: URL, base: string): boolean => {
	const baseUrl = new URL(base);
	return target.origin === baseUrl.origin;
};

const buildCustomFetch = (options: BuildCustomFetchOptions): FetchFunction => {
	const fetchImpl = options.fetchImpl ?? globalThis.fetch;
	if (typeof fetchImpl !== 'function') {
		throw new Error('fetch is required in the current runtime');
	}

	const baseUrl = options.apiBaseUrl;

	return (input, init) => {
		const requestUrl = resolveRequestUrl(input, baseUrl);
		const headers = new Headers();
		if (typeof Request !== 'undefined' && input instanceof Request) {
			input.headers.forEach((value, key) => {
				headers.set(key, value);
			});
		}
		new Headers(init?.headers).forEach((value, key) => {
			headers.set(key, value);
		});

		if (isSameOrigin(requestUrl, baseUrl)) {
			const sessionToken = options.getSessionToken();
			if (sessionToken) {
				headers.set('X-Session-Token', sessionToken);
			}

			if (options.tenantId) {
				headers.set(TENANT_ID_HEADER_KEY, options.tenantId);
			}
		}

		if (typeof Request !== 'undefined' && input instanceof Request) {
			const mergedRequest = new Request(requestUrl, {
				...init,
				headers,
			});

			return fetchImpl(mergedRequest);
		}

		return fetchImpl(requestUrl, { ...init, headers });
	};
};

const buildClient = (options: BuildClientOptions): ApiClient => {
	const apiBaseUrl = resolveApiBaseUrl();
	const customFetch = buildCustomFetch({
		getSessionToken: options.getSessionToken,
		tenantId: options.tenantId,
		fetchImpl: options.fetchImpl,
		apiBaseUrl,
	});
	const adapter = new FetchRequestAdapter(
		new AnonymousAuthenticationProvider(),
		undefined,
		undefined,
		KiotaClientFactory.create(customFetch),
	);

	adapter.baseUrl = apiBaseUrl;
	return createApiClient(adapter);
};

const getSessionTokensFromCookie = (cookieValueProvider: CookieValueProvider): ParsedSessionTokens => {
	let rawCookieValue: string | undefined;
	try {
		rawCookieValue = cookieValueProvider();
	} catch {
		return {};
	}

	if (!rawCookieValue) {
		return {};
	}

	return parseSessionCookie(cookie.parse(rawCookieValue)[SESSION_TOKEN_COOKIE_KEY] ?? '');
};

const getSessionTokensFromBrowser = (): ParsedSessionTokens =>
	getSessionTokensFromCookie(getDefaultCookieValue);

class ClientManager implements ClientAccessor<ApiClient> {
	private tenantClientMap = new Map<string, ApiClient>();
	private staffClient: ApiClient | undefined;
	private anonymousClient: ApiClient | undefined;
	private readonly sessionTokenProvider: SessionTokenProvider;

	public constructor(options: ClientManagerOptions = {}) {
		this.sessionTokenProvider = options.sessionTokenProvider ?? sessionTokenProvider;
	}

	getOrCreateClient(tenantId: string): ApiClient {
		const safeTenantId = normalizeTenantId(tenantId);

		const cached = this.tenantClientMap.get(safeTenantId);
		if (cached) {
			return cached;
		}

		const apiClient = buildClient({
			getSessionToken: () => this.sessionTokenProvider('tenant'),
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
			getSessionToken: () => this.sessionTokenProvider('staff'),
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

const createClientManager = (): ClientManager => {
	return new ClientManager({
		sessionTokenProvider,
	});
};

const getClientManager = (): ClientManager => {
	if (!clientManager) {
		clientManager = createClientManager();
	}

	return clientManager;
};

const resetClientManager = (): void => {
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
	setSessionTokenProvider,
};
