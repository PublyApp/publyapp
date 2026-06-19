import { AnonymousAuthenticationProvider } from '@microsoft/kiota-abstractions';
import {
	FetchRequestAdapter,
	KiotaClientFactory,
} from '@microsoft/kiota-http-fetchlibrary';

import { type ApiClient, createApiClient } from '@org/client-ts/src/apiClient';
import {
	SESSION_TOKEN_HEADER_KEY,
	TENANT_ID_HEADER_KEY,
} from '@org/shared-ts/lib/constants';

import { getSessionTokensFromCookieHeader } from './session-cookie';

// =============================================================================
// Kiota client factory — DIRECT-KIOTA model (Architecture gate).
//
// The .NET API via Kiota is the single source of truth. This factory builds:
//   - a BROWSER client (token from document.cookie, PUBLIC base read at RUNTIME)
//   - a per-request SERVER client (token from the request Cookie header, SERVER base)
//
// It mirrors apps/front/src/lib/api-client/client-manager.ts:230-262 (the custom-fetch
// + header-injection pattern), but exposes a small, testable `buildCustomFetch` seam.
//
// NEVER hardcode the header keys — `TENANT_ID_HEADER_KEY` is computed by toPascalCase
// (resolves to `X-PublyApp-TenantId`). NEVER log the session token at any level.
// =============================================================================

/** Which API base the client targets. */
export type ApiBase = 'public' | 'server';

type BuildCustomFetchOptions = {
	/** Lazily resolves the session token at request time (may be undefined). */
	getSessionToken: () => string | undefined;
	/** Optional tenant id → `X-PublyApp-TenantId` header. */
	tenantId?: string;
	/** Injectable fetch (tests pass a fake; production omits → global fetch). */
	fetchImpl?: typeof fetch;
};

/**
 * Builds a custom `fetch` that injects the session-token + tenant-id headers.
 * The token is read lazily per request and is NEVER logged.
 */
export const buildCustomFetch = (
	options: BuildCustomFetchOptions,
): typeof fetch => {
	const fetchImpl = options.fetchImpl ?? fetch;

	return (url: Parameters<typeof fetch>[0], init?: RequestInit) => {
		const sessionToken = options.getSessionToken();
		const headers = new Headers(init?.headers);

		if (sessionToken) headers.set(SESSION_TOKEN_HEADER_KEY, sessionToken);
		if (options.tenantId) headers.set(TENANT_ID_HEADER_KEY, options.tenantId);

		return fetchImpl(url, { ...init, headers });
	};
};

/**
 * Resolves the API base URL for the chosen target.
 *
 *  - `public` → the BROWSER-reachable (Traefik-exposed) API. Read at RUNTIME from
 *    `window.__ENV__.PUBLIC_API_BASE_URL` (injected by __root.tsx), NOT build-time
 *    `import.meta.env`, so one image works across environments.
 *  - `server` → the internal compose host, from `process.env.SERVER_API_BASE_URL`
 *    (SSR only — never reachable from / shipped to the browser).
 */
const resolveBaseUrl = (base: ApiBase): string => {
	if (base === 'server') {
		const serverBase = process.env.SERVER_API_BASE_URL;
		if (!serverBase) {
			throw new Error('SERVER_API_BASE_URL is not set (server API base)');
		}
		return serverBase;
	}

	// base === 'public' — read the runtime-injected public base in the browser.
	const runtimeEnv = typeof window === 'undefined' ? undefined : window.__ENV__;
	const publicBase = runtimeEnv?.PUBLIC_API_BASE_URL;
	if (!publicBase) {
		throw new Error(
			'window.__ENV__.PUBLIC_API_BASE_URL is not set (public API base)',
		);
	}
	return publicBase;
};

type CreateClientOptions = {
	/** Session token to send (staff or tenant). */
	sessionToken?: string;
	/** Optional tenant id header. */
	tenantId?: string;
	/** Which API base to target. */
	base: ApiBase;
	/** Injectable fetch (tests pass a fake; production omits → global fetch). */
	fetchImpl?: typeof fetch;
};

/**
 * Creates a Kiota `ApiClient` wired to the given base + an optional session token.
 */
export const createClient = (options: CreateClientOptions): ApiClient => {
	const customFetch = buildCustomFetch({
		getSessionToken: () => options.sessionToken,
		tenantId: options.tenantId,
		fetchImpl: options.fetchImpl,
	});

	const authProvider = new AnonymousAuthenticationProvider();
	const httpClient = KiotaClientFactory.create(customFetch);
	const adapter = new FetchRequestAdapter(
		authProvider,
		undefined,
		undefined,
		httpClient,
	);
	adapter.baseUrl = resolveBaseUrl(options.base);
	return createApiClient(adapter);
};

export const getSessionTokenFromCookieHeaderForServer = (
	cookieHeader: string | undefined,
): string | undefined => {
	const { staffToken, tenantToken } =
		getSessionTokensFromCookieHeader(cookieHeader);
	return tenantToken ?? staffToken;
};

/**
 * Builds a per-request SERVER client from a raw `Cookie` request header.
 *
 * Used by SSR loaders (Task 2.6): `getRequestHeader('cookie')` returns the FULL Cookie
 * header, so we extract the tokens with `getSessionTokensFromCookieHeader` (NOT
 * `parseSessionCookie`, which expects only the raw token value). Tenant token wins;
 * staff token only used when tenant token is absent.
 */
export const createServerClientFromCookie = (
	cookieHeader: string | undefined,
	fetchImpl?: typeof fetch,
): ApiClient => {
	return createClient({
		sessionToken: getSessionTokenFromCookieHeaderForServer(cookieHeader),
		base: 'server',
		fetchImpl,
	});
};
