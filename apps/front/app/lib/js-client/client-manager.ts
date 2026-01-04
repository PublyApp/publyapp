import { AnonymousAuthenticationProvider } from '@microsoft/kiota-abstractions';
import {
	FetchRequestAdapter,
	KiotaClientFactory,
} from '@microsoft/kiota-http-fetchlibrary';

import { type ApiClient, createApiClient } from '@org/js-client/src/apiClient';
import {
	isServer,
	SESSION_TOKEN_HEADER_KEY,
	TENANT_ID_HEADER_KEY,
} from '@/shared/lib/constants';

import { getSessionCookieFromClient } from '../cookies/session-cookie.utils';
import { env } from '../env';

/**
 * Singleton manager for the API clients
 */
class ClientManager {
	private static _instance: ClientManager;

	public static getInstance() {
		if (!ClientManager._instance) {
			ClientManager._instance = new ClientManager();
		}
		return ClientManager._instance;
	}

	private static _anonymousClient: ApiClient;

	get anonymousClient() {
		return ClientManager._anonymousClient;
	}

	private _clientsStore: Map<string, ApiClient> = new Map();

	public clientsStore: Map<string, ApiClient>;

	public removeClient(tenantId: string) {
		this.clientsStore.delete(tenantId);
	}

	public getStaffClient() {
		return this.getOrCreateClient('staff');
	}

	public removeStaffClient() {
		this.removeClient('staff');
	}

	public clearClients() {
		this.clientsStore.clear();
	}

	/**
	 * Gets or creates an API client for the specified tenant (browser-only).
	 * Session tokens are read fresh from cookies on every request.
	 *
	 * @param tenantId - The tenant ID to create the client for
	 * @returns The API client for the tenant
	 */
	public getOrCreateClient(tenantId: string) {
		if (isServer) {
			// This method should not be invoked on the server because
			// it depends on browser-side session tokens/cookies.
			throw new Error('getOrCreateClient cannot be used on the server');
		}

		let client = this.clientsStore.get(tenantId);

		if (!client) {
			client = this.createClientOnBrowser({ tenantId });
			this.clientsStore.set(tenantId, client);
		}

		return client;
	}

	/**
	 * Creates an API client for browser-side usage.
	 * Session tokens are read fresh from cookies on every request (unless skipAuth is true).
	 *
	 * @param options.tenantId - Optional tenant ID to include in requests
	 * @param options.skipAuth - If true, don't include session token (for anonymous/public endpoints)
	 * @returns A new API client instance
	 */
	public createClientOnBrowser(options: {
		tenantId?: string;
		skipAuth?: boolean;
	}) {
		// Custom fetch that injects session token and tenant ID headers on every request
		const customFetch = (
			url: Parameters<typeof fetch>[0],
			init?: RequestInit,
		) => {
			// Read session token FRESH on every request (unless skipAuth)
			const sessionToken = options.skipAuth
				? undefined
				: getSessionCookieFromClient();

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

		return ClientManager.createClientWithFetch(customFetch);
	}

	/**
	 * Creates an API client for server-side usage (SSR).
	 * Session tokens must be explicitly provided (from request cookies).
	 *
	 * @param options.sessionToken - Optional session token from request cookies
	 * @param options.tenantId - Optional tenant ID to include in requests
	 * @returns A new API client instance
	 */
	public static createClientOnServer(options: {
		sessionToken?: string;
		tenantId?: string;
	}) {
		// Custom fetch that injects session token and tenant ID headers
		const customFetch = (
			url: Parameters<typeof fetch>[0],
			init?: RequestInit,
		) => {
			return fetch(url, {
				...init,
				headers: {
					...init?.headers,
					...(options.sessionToken
						? { [SESSION_TOKEN_HEADER_KEY]: options.sessionToken }
						: {}),
					...(options.tenantId
						? { [TENANT_ID_HEADER_KEY]: options.tenantId }
						: {}),
				},
			});
		};

		return ClientManager.createClientWithFetch(customFetch);
	}

	/**
	 * Internal helper to create an API client with a custom fetch function.
	 */
	private static createClientWithFetch(customFetch: typeof fetch) {
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

	private constructor() {
		// Anonymous client explicitly skips auth (no session token)
		ClientManager._anonymousClient = this.createClientOnBrowser({
			skipAuth: true,
		});

		if (isServer) {
			this.clientsStore = new Proxy(this._clientsStore, {
				get: () => {
					throw new Error(
						'It is not allowed to use the clientsStore on the server to avoid memory leaks, etc',
					);
				},
			}) as Map<string, ApiClient>;
		} else {
			this.clientsStore = this._clientsStore;
		}
	}
}

export const clientManager = ClientManager.getInstance();
export const createClientOnServer = ClientManager.createClientOnServer;
