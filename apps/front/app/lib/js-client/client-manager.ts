import { AnonymousAuthenticationProvider } from '@microsoft/kiota-abstractions';
import {
	FetchRequestAdapter,
	KiotaClientFactory,
} from '@microsoft/kiota-http-fetchlibrary';
import _ from 'lodash';

import { type ApiClient, createApiClient } from '@org/js-client/src/apiClient';
import {
	isServer,
	SESSION_TOKEN_HEADER_KEY,
	TENANT_ID_HEADER_KEY,
} from '@/shared/lib/constants';

import { getSessionCookieFromClient } from '../cookies/session-cookie.utils';
import { env } from '../env';

type ClientManagerOptions = {
	/** Session token for authentication. If not provided, reads from cookie (browser). */
	sessionToken?: string;
};

/**
 * Manager for creating API clients.
 *
 * Usage:
 * - Browser: `ClientManager.create()` returns singleton (reads session from cookie)
 * - Server: `ClientManager.create({ sessionToken })` creates per-request instance
 *
 * @example
 * import { ClientManager } from '@/front/lib/js-client/client-manager';
 *
 * // Browser - returns singleton, session from cookie
 * ClientManager.create().createClient({ tenantId });
 *
 * // Server - new instance per request
 * ClientManager.create({ sessionToken }).createClient({ tenantId });
 *
 * // Server - public/anonymous endpoints
 * ClientManager.create().createClient({ skipAuth: true });
 */
export class ClientManager {
	private static _instance: ClientManager;

	private readonly explicitSessionToken?: string;
	private readonly hasExplicitToken: boolean;
	private readonly clientsCache = new Map<string, ApiClient>();

	private constructor(options?: ClientManagerOptions) {
		this.explicitSessionToken = options?.sessionToken;
		this.hasExplicitToken =
			!_.isNil(options?.sessionToken) && !_.isEmpty(options?.sessionToken);
	}

	/**
	 * Creates or returns a ClientManager instance.
	 * - Browser: returns singleton (session from cookie)
	 * - Server: creates new instance (pass sessionToken for auth)
	 *
	 * @param options.sessionToken - Session token for authentication (server only)
	 */
	public static create(options?: ClientManagerOptions): ClientManager {
		if (!isServer) {
			// Browser: return singleton
			if (!ClientManager._instance) {
				ClientManager._instance = new ClientManager();
			}
			return ClientManager._instance;
		}

		// Server: create new instance per request
		return new ClientManager(options);
	}

	/**
	 * Gets the session token - either explicit (server) or from cookie (browser).
	 */
	private getSessionToken(): string | undefined {
		if (this.hasExplicitToken) {
			return this.explicitSessionToken;
		}
		if (isServer) {
			// No cookie access on server - return undefined (anonymous)
			return undefined;
		}
		return getSessionCookieFromClient();
	}

	/**
	 * Creates a new API client.
	 *
	 * @param options.tenantId - Optional tenant ID to include in requests
	 * @param options.skipAuth - If true, don't include session token (anonymous)
	 */
	public createClient(options?: {
		tenantId?: string;
		skipAuth?: boolean;
	}): ApiClient {
		const getSessionToken = (): string | undefined => {
			if (options?.skipAuth) {
				return undefined;
			}
			return this.getSessionToken();
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
	 * Gets or creates a cached staff client (no tenant ID).
	 */
	public getStaffClient(): ApiClient {
		return this.getOrCreateClient('staff');
	}

	/**
	 * Gets an anonymous client (no session token, no tenant ID).
	 */
	public getAnonymousClient(): ApiClient {
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
		if (tenantId === '__anonymous__') {
			throw new Error('Cannot remove anonymous client');
		}
		this.clientsCache.delete(tenantId);
	}

	/**
	 * Removes the cached staff client.
	 */
	public removeStaffClient(): void {
		this.removeClient('staff');
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
			return fetch(url, {
				...init,
				headers: {
					...init?.headers,
					...(sessionToken ? { [SESSION_TOKEN_HEADER_KEY]: sessionToken } : {}),
					...(options.tenantId
						? { [TENANT_ID_HEADER_KEY]: options.tenantId }
						: {}),
				},
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
