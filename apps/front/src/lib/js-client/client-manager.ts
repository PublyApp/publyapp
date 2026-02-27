import { AnonymousAuthenticationProvider } from '@microsoft/kiota-abstractions';
import {
	FetchRequestAdapter,
	KiotaClientFactory,
} from '@microsoft/kiota-http-fetchlibrary';

import { type ApiClient, createApiClient } from '@org/client-ts/src/apiClient';
import {
	isServer,
	SESSION_TOKEN_HEADER_KEY,
	TENANT_ID_HEADER_KEY,
} from '@org/shared-ts/lib/constants';

import { getSessionTokensFromClient } from '../cookies/session-cookie.utils';
import { env } from '../env';

type ClientManagerOptions = {
	/** Staff session token (for staff UI access). */
	staffToken?: string;
	/** Tenant session token (for tenant UI access, including impersonation). */
	tenantToken?: string;
};

type CreateClientOptions = {
	/** Optional tenant ID to include in requests. */
	tenantId?: string;
	/** If true, don't include session token (anonymous). */
	skipAuth?: boolean;
	/** Which token context to use. Defaults to 'tenant' if available, otherwise 'staff'. */
	context?: 'staff' | 'tenant';
};

/**
 * Manager for creating API clients with dual token support.
 *
 * Supports two session tokens for impersonation:
 * - staffToken: For staff UI access
 * - tenantToken: For tenant UI access (regular or impersonation)
 *
 * Usage:
 * - Browser: `getClientManager()` returns singleton (reads tokens from cookie)
 * - Server: `getClientManager({ staffToken, tenantToken })` creates per-request instance
 *
 * @example
 * import { getClientManager } from '@/front/lib/js-client/client-manager';
 *
 * // Browser - returns singleton, tokens from cookie
 * getClientManager().createClient({ tenantId });
 *
 * // Server - new instance per request
 * getClientManager({ staffToken, tenantToken }).createClient({ tenantId });
 *
 * // Explicit context (for staff UI while impersonating)
 * getClientManager().createClient({ context: 'staff' });
 *
 * // Public/anonymous endpoints
 * getClientManager().createClient({ skipAuth: true });
 */
export class ClientManager {
	private static _instance: ClientManager | undefined;

	private readonly staffToken?: string;
	private readonly tenantToken?: string;
	private readonly clientsCache = new Map<string, ApiClient>();

	private constructor(options?: ClientManagerOptions) {
		this.staffToken = options?.staffToken;
		this.tenantToken = options?.tenantToken;
	}

	/**
	 * Creates or returns a ClientManager instance.
	 * - Browser: returns singleton (reads tokens from cookie)
	 * - Server: creates new instance (pass staffToken/tenantToken)
	 */
	public static create(options?: ClientManagerOptions): ClientManager {
		if (!isServer) {
			// Browser: return singleton, read tokens from cookie
			if (!ClientManager._instance) {
				const tokens = getSessionTokensFromClient();
				ClientManager._instance = new ClientManager({
					staffToken: tokens.staffToken,
					tenantToken: tokens.tenantToken,
				});
			}
			return ClientManager._instance;
		}

		// Server: create new instance per request
		return new ClientManager(options);
	}

	/**
	 * Resets the browser singleton. Call after cookie changes
	 * (login, logout, impersonation start/end).
	 */
	public static resetInstance(): void {
		if (!isServer) {
			ClientManager._instance = undefined;
		}
	}

	/**
	 * Gets the session token based on context.
	 * - 'staff': returns staffToken, falls back to tenantToken for legacy cookie compatibility
	 * - 'tenant': returns tenantToken
	 * - undefined: returns tenantToken if available, otherwise staffToken
	 *
	 * On browser, reads fresh from cookies to handle token changes without page reload.
	 * On server, uses tokens passed at construction time.
	 *
	 * Note: Legacy cookies (no s:/t: prefix) are parsed as tenantToken only, so staff
	 * context must fallback to tenantToken to maintain backward compatibility.
	 */
	private getSessionToken(context?: 'staff' | 'tenant'): string | undefined {
		// On browser, read fresh from cookies to handle token changes
		if (!isServer) {
			const tokens = getSessionTokensFromClient();
			// Staff context: prefer staffToken, fallback to tenantToken (legacy compatibility)
			if (context === 'staff') return tokens.staffToken ?? tokens.tenantToken;
			if (context === 'tenant') return tokens.tenantToken;
			return tokens.tenantToken ?? tokens.staffToken;
		}

		// On server, use tokens passed at construction
		// Staff context: prefer staffToken, fallback to tenantToken (legacy compatibility)
		if (context === 'staff') return this.staffToken ?? this.tenantToken;
		if (context === 'tenant') return this.tenantToken;
		return this.tenantToken ?? this.staffToken;
	}

	/**
	 * Creates a new API client.
	 *
	 * @param options.tenantId - Optional tenant ID to include in requests
	 * @param options.skipAuth - If true, don't include session token (anonymous)
	 * @param options.context - Which token to use: 'staff' or 'tenant' (default: tenant if available)
	 */
	public createClient(options?: CreateClientOptions): ApiClient {
		const getSessionToken = (): string | undefined => {
			if (options?.skipAuth) {
				return undefined;
			}
			return this.getSessionToken(options?.context);
		};

		const customFetch = ClientManager.createCustomFetch({
			getSessionToken,
			tenantId: options?.tenantId,
		});

		return ClientManager.createClientWithFetch(customFetch);
	}

	/**
	 * Gets or creates a cached API client for the specified tenant.
	 * Clients are cached for the lifetime of this ClientManager instance.
	 */
	public getOrCreateClient(tenantId: string): ApiClient {
		let client = this.clientsCache.get(tenantId);

		if (!client) {
			client = this.createClient({ tenantId });
			this.clientsCache.set(tenantId, client);
		}

		return client;
	}

	/**
	 * Gets or creates a cached staff client.
	 * Uses staffToken and does NOT send tenant-id header.
	 */
	public getOrCreateStaffClient(): ApiClient {
		let client = this.clientsCache.get('__staff__');

		if (!client) {
			client = this.createClient({ context: 'staff' });
			this.clientsCache.set('__staff__', client);
		}

		return client;
	}

	/**
	 * Gets an anonymous client (no session token, no tenant ID).
	 */
	public getOrCreateAnonymousClient(): ApiClient {
		let client = this.clientsCache.get('__anonymous__');

		if (!client) {
			client = this.createClient({ skipAuth: true });
			this.clientsCache.set('__anonymous__', client);
		}

		return client;
	}

	/**
	 * Removes a cached client.
	 */
	public removeClient(tenantId: string): void {
		this.clientsCache.delete(tenantId);
	}

	/**
	 * Removes the cached staff client.
	 */
	public removeStaffClient(): void {
		this.clientsCache.delete('__staff__');
	}

	/**
	 * Removes the cached anonymous client.
	 */
	public removeAnonymousClient(): void {
		this.clientsCache.delete('__anonymous__');
	}

	/**
	 * Clears all cached clients.
	 */
	public clearClients(): void {
		this.clientsCache.clear();
	}

	/**
	 * Creates a custom fetch function that injects session token and tenant ID headers.
	 */
	private static createCustomFetch(options: {
		getSessionToken: () => string | undefined;
		tenantId?: string;
	}): typeof fetch {
		return (url: Parameters<typeof fetch>[0], init?: RequestInit) => {
			const sessionToken = options.getSessionToken();
			const headers = new Headers(init?.headers);

			if (sessionToken) headers.set(SESSION_TOKEN_HEADER_KEY, sessionToken);
			if (options.tenantId) headers.set(TENANT_ID_HEADER_KEY, options.tenantId);

			return fetch(url, {
				...init,
				headers,
			});
		};
	}

	/**
	 * Internal helper to create an API client with a custom fetch function.
	 */
	private static createClientWithFetch(customFetch: typeof fetch): ApiClient {
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
	}
}

export const getClientManager = (
	options?: ClientManagerOptions,
): ClientManager => {
	return ClientManager.create(options);
};
