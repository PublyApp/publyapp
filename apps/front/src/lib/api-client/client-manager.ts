import { AnonymousAuthenticationProvider } from '@microsoft/kiota-abstractions';
import {
	FetchRequestAdapter,
	KiotaClientFactory,
} from '@microsoft/kiota-http-fetchlibrary';
import * as cookie from 'cookie';

import type { ApiClient } from '@org/client-ts/apiClient';
import { createApiClient } from '@org/client-ts/apiClient';
import {
	SESSION_TOKEN_COOKIE_KEY,
	TENANT_ID_HEADER_KEY,
} from '@org/shared-ts/lib/constants';
import type { ClientAccessor } from '@org/shared-ts/lib/query/types';
import {
	parseSessionCookie,
	selectToken,
} from '@org/shared-ts/lib/session/parse';
import type { ParsedSessionTokens } from '@org/shared-ts/lib/session/parse';

import { getPublicEnv, getServerEnv } from '../env';

type SessionScope = 'tenant' | 'staff';
type FetchFunction = (
	input: RequestInfo | URL,
	init?: RequestInit,
) => Promise<Response>;
type RequestInitWithDuplex = RequestInit & {
	duplex?: 'half';
};
type RequestLike = {
	url: string;
	headers?: HeadersInit;
	method?: RequestInit['method'];
	body?: RequestInit['body'];
	cache?: RequestInit['cache'];
	credentials?: RequestInit['credentials'];
	mode?: RequestInit['mode'];
	redirect?: RequestInit['redirect'];
	referrer?: RequestInit['referrer'];
	referrerPolicy?: RequestInit['referrerPolicy'];
	integrity?: RequestInit['integrity'];
	keepalive?: RequestInit['keepalive'];
	signal?: RequestInit['signal'];
	duplex?: RequestInitWithDuplex['duplex'];
};

type CookieValueProvider = () => string | undefined;
type SessionTokenProvider = (scope: SessionScope) => string | undefined;

type BuildCustomFetchOptions = {
	getSessionToken: () => string | undefined;
	tenantId?: string;
	fetchImpl?: FetchFunction;
	apiBaseUrl: string;
	signal?: AbortSignal;
};

type BuildClientOptions = {
	getSessionToken: () => string | undefined;
	tenantId?: string;
	fetchImpl?: FetchFunction;
	signal?: AbortSignal;
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

	// The server's `setCookie` percent-encodes the "t:"/"s:"-prefixed value;
	// use the default decoder (decodeURIComponent) to reverse it, see the
	// matching comment in lib/server/session-actions.ts.
	const parsedCookie = cookie.parse(rawCookieValue);
	const rawCookie = parsedCookie[SESSION_TOKEN_COOKIE_KEY];
	if (!rawCookie) {
		return undefined;
	}

	return selectToken(parseSessionCookie(rawCookie), scope);
};

let sessionTokenProvider: SessionTokenProvider = defaultSessionTokenProvider;

// No `document` means this is running server-side (SSR / a server function
// handler), which is a separate network namespace from the browser: in
// Docker/Compose the browser-reachable PUBLIC_API_BASE_URL (Traefik host) is
// NOT reachable from inside the server container, only the internal
// SERVER_API_BASE_URL (e.g. a Docker service name) is.
const isServerRuntime = (): boolean => typeof document === 'undefined';

const resolveApiBaseUrl = (): string => {
	if (isServerRuntime()) {
		return getServerEnv().apiBaseUrl;
	}

	return getPublicEnv().apiBaseUrl;
};

const isRequestLike = (input: unknown): input is RequestLike => {
	if (typeof input !== 'object' || input === null) {
		return false;
	}

	const candidate = input as {
		url?: unknown;
	};
	return typeof candidate.url === 'string' && candidate.url.length > 0;
};

const isUrlLike = (input: RequestInfo | URL): input is URL => {
	if (typeof input !== 'object' || input === null) {
		return false;
	}

	const candidate = input as {
		href?: unknown;
		toString?: unknown;
	};

	const hasHref = typeof candidate.href === 'string';
	return hasHref && typeof candidate.toString === 'function';
};

const resolveRequestUrl = (input: RequestInfo | URL, baseUrl: string): URL => {
	if (isRequestLike(input)) {
		return new URL(input.url, baseUrl);
	}

	if (typeof input === 'string') {
		return new URL(input, baseUrl);
	}

	if (isUrlLike(input)) {
		return new URL(String(input), baseUrl);
	}

	throw new Error('Unsupported fetch RequestInfo in client adapter');
};

const isSameOrigin = (target: URL, base: string): boolean => {
	const baseUrl = new URL(base);
	return target.origin === baseUrl.origin;
};

const pickRequestInit = (input: RequestLike): RequestInit => {
	const init: RequestInitWithDuplex = {};
	if (input.method !== undefined) {
		init.method = input.method;
	}

	if (input.body !== undefined) {
		init.body = input.body;
	}

	if (input.cache !== undefined) {
		init.cache = input.cache;
	}

	if (input.credentials !== undefined) {
		init.credentials = input.credentials;
	}

	if (input.mode !== undefined) {
		init.mode = input.mode;
	}

	if (input.redirect !== undefined) {
		init.redirect = input.redirect;
	}

	if (input.referrer !== undefined) {
		init.referrer = input.referrer;
	}

	if (input.referrerPolicy !== undefined) {
		init.referrerPolicy = input.referrerPolicy;
	}

	if (input.integrity !== undefined) {
		init.integrity = input.integrity;
	}

	if (input.keepalive !== undefined) {
		init.keepalive = input.keepalive;
	}

	if (input.signal !== undefined) {
		init.signal = input.signal;
	}

	if (input.duplex !== undefined) {
		init.duplex = input.duplex;
	}

	return init;
};

const buildCustomFetch = (options: BuildCustomFetchOptions): FetchFunction => {
	const fetchImpl = options.fetchImpl ?? globalThis.fetch;
	if (typeof fetchImpl !== 'function') {
		throw new Error('fetch is required in the current runtime');
	}

	const baseUrl = options.apiBaseUrl;

	return (input, init) => {
		const requestUrl = resolveRequestUrl(input, baseUrl);
		const requestLike = isRequestLike(input);
		const requestInputInit = requestLike ? pickRequestInit(input) : {};
		const headers = new Headers();

		if (requestLike && input.headers) {
			for (const [key, value] of new Headers(input.headers)) {
				headers.set(key, value);
			}
		}

		for (const [key, value] of new Headers(init?.headers)) {
			headers.set(key, value);
		}

		if (isSameOrigin(requestUrl, baseUrl)) {
			const sessionToken = options.getSessionToken();
			if (sessionToken) {
				headers.set('X-Session-Token', sessionToken);
			}

			if (options.tenantId) {
				headers.set(TENANT_ID_HEADER_KEY, options.tenantId);
			}
		}

		if (requestLike) {
			const signal = options.signal ?? init?.signal ?? requestInputInit.signal;
			const headersAndSignal: RequestInit = { headers };
			if (signal) {
				headersAndSignal.signal = signal;
			}
			const mergedRequest = new Request(input.url, {
				...requestInputInit,
				...init,
				...headersAndSignal,
			});

			return fetchImpl(mergedRequest);
		}

		const initWithHeaders: RequestInit = { ...init, headers };
		if (options.signal) {
			initWithHeaders.signal = options.signal;
		}
		return fetchImpl(requestUrl, initWithHeaders);
	};
};

const buildClient = (options: BuildClientOptions): ApiClient => {
	const apiBaseUrl = resolveApiBaseUrl();
	const customFetch = buildCustomFetch({
		getSessionToken: options.getSessionToken,
		tenantId: options.tenantId,
		fetchImpl: options.fetchImpl,
		apiBaseUrl,
		signal: options.signal,
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

const getSessionTokensFromCookie = (
	cookieValueProvider: CookieValueProvider,
): ParsedSessionTokens => {
	let rawCookieValue: string | undefined;
	try {
		rawCookieValue = cookieValueProvider();
	} catch {
		return {};
	}

	if (!rawCookieValue) {
		return {};
	}

	return parseSessionCookie(
		cookie.parse(rawCookieValue)[SESSION_TOKEN_COOKIE_KEY] ?? '',
	);
};

const getSessionTokensFromBrowser = (): ParsedSessionTokens =>
	getSessionTokensFromCookie(getDefaultCookieValue);

class ClientManager implements ClientAccessor<ApiClient> {
	private tenantClientMap = new Map<string, ApiClient>();
	private staffClient: ApiClient | undefined;
	private tenantScopeClient: ApiClient | undefined;
	private anonymousClient: ApiClient | undefined;
	private sessionClient: ApiClient | undefined;
	private readonly sessionTokenProvider: SessionTokenProvider;

	public constructor(options: ClientManagerOptions = {}) {
		this.sessionTokenProvider =
			options.sessionTokenProvider ?? sessionTokenProvider;
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

	getOrCreateTenantScopeClient(): ApiClient {
		if (this.tenantScopeClient) {
			return this.tenantScopeClient;
		}

		this.tenantScopeClient = buildClient({
			getSessionToken: () => this.sessionTokenProvider('tenant'),
		});
		return this.tenantScopeClient;
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

	/**
	 * For scope-agnostic session endpoints (e.g. `/auth/user-auth-data`) that
	 * must authenticate whichever account is signed in — tenant or staff.
	 * Staff/tenant mutual exclusivity (AGENTS.md) guarantees at most one of
	 * the two tokens is ever set, so trying tenant then staff never masks one
	 * scope's session with the other's.
	 */
	getOrCreateSessionClient(): ApiClient {
		if (this.sessionClient) {
			return this.sessionClient;
		}

		this.sessionClient = buildClient({
			getSessionToken: () =>
				this.sessionTokenProvider('tenant') ??
				this.sessionTokenProvider('staff'),
		});
		return this.sessionClient;
	}

	clearClients(): void {
		this.tenantClientMap.clear();
		this.staffClient = undefined;
		this.tenantScopeClient = undefined;
		this.anonymousClient = undefined;
		this.sessionClient = undefined;
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

export {
	getSessionTokensFromBrowser,
	resolveApiBaseUrl,
	buildClient as createClient,
	buildCustomFetch,
	getClientManager,
};
