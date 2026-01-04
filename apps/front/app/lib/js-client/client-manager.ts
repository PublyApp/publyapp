import {
	AnonymousAuthenticationProvider,
	ApiKeyAuthenticationProvider,
	ApiKeyLocation,
	type AuthenticationProvider,
} from '@microsoft/kiota-abstractions';
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

// import { AnonymousAuthenticationProvider } from '@microsoft/kiota-abstractions';
// import { FetchRequestAdapter, KiotaClientFactory } from '@microsoft/kiota-http-fetchlibrary';

// import { createClient } from './generated/client.js';

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

	public getStaffClient(sessionToken?: string) {
		return this.getOrCreateClient('staff', sessionToken);
	}

	public removeClient(tenantId: string) {
		this.clientsStore.delete(tenantId);
	}

	public setClient(tenantId: string, client: ApiClient) {
		this.clientsStore.set(tenantId, client);
	}

	public setStaffClient(sessionToken?: string) {
		this.setClient('staff', this.createClientWithOptions({ sessionToken }));
	}

	public removeStaffClient() {
		this.removeClient('staff');
	}

	public clearClients() {
		this.clientsStore.clear();
	}

	public getOrCreateClient(
		tenantId: string,
		sessionToken?: string,
		// { tryReadFromCookies = true }: { tryReadFromCookies?: boolean } = {},
	) {
		if (isServer) {
			throw new Error(
				'It is not allowed to use the getOrCreateClient on the server because it uses the clients store internally',
			);
		}

		let client = this.clientsStore.get(tenantId);

		if (!client) {
			// If sessionToken not provided, try to read from cookies (client-side only)
			// let _sessionToken = sessionToken;

			// if (!_sessionToken && tryReadFromCookies && !isServer) {
			// 	_sessionToken = getSessionCookieFromClient();
			// }

			client = this.createClientWithOptions({ sessionToken });
			this.clientsStore.set(tenantId, client);
			return client;
		}

		return client;
	}

	public createClientWithOptions(options: {
		sessionToken?: string;
		tenantId?: string;
	}) {
		// Define a custom fetch function to set the 'credentials' option.
		// This function wraps the global fetch, but adds our required option.
		const customFetch = (
			url: Parameters<typeof fetch>[0],
			init?: RequestInit,
		) =>
			fetch(url, {
				...init,
				headers: {
					...init?.headers,
					...(options.tenantId
						? { [TENANT_ID_HEADER_KEY]: options.tenantId }
						: {}),
					// already set by the AuthenticationProvider
					// ...(options.sessionToken ? { [SESSION_TOKEN_HEADER_KEY]: options.sessionToken } : {}),
				},
				// credentials: 'include', // 'include' tells the browser to send cookies
			});

		let authProvider: AuthenticationProvider;

		if (options.sessionToken) {
			authProvider = new ApiKeyAuthenticationProvider(
				options.sessionToken,
				SESSION_TOKEN_HEADER_KEY,
				ApiKeyLocation.Header,
			);
		} else {
			authProvider = new AnonymousAuthenticationProvider();
		}

		const httpClient = KiotaClientFactory.create(customFetch);
		const adapter = new FetchRequestAdapter(
			authProvider,
			undefined,
			undefined,
			httpClient,
		);
		adapter.baseUrl = env.VITE_ASP_SERVER_URL;
		const apiClient = createApiClient(adapter);
		return apiClient;
	}

	// private static _apiClient: ApiClient;

	// get apiClient() {
	// 	return ClientManager._apiClient;
	// }

	// setApiClient(apiClient: ApiClient) {
	// 	ClientManager._apiClient = apiClient;
	// }

	private constructor() {
		ClientManager._anonymousClient = this.createClientWithOptions({});
		// ClientManager._apiClient = ClientManager._anonymousClient;

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

	// public createApiClient(sessionToken?: string) {
	// 	let authProvider: AuthenticationProvider;
	// 	if (sessionToken) {
	// 		authProvider = new ApiKeyAuthenticationProvider(
	// 			sessionToken,
	// 			SESSION_TOKEN_HEADER_KEY,
	// 			ApiKeyLocation.Header,
	// 		);
	// 	} else {
	// 		authProvider = new AnonymousAuthenticationProvider();
	// 	}
	// 	const adapter = new FetchRequestAdapter(authProvider);
	// 	adapter.baseUrl = env.VITE_ASP_SERVER_URL;
	// 	const apiClient = createApiClient(adapter);
	// 	return apiClient;
	// }
}

export const clientManager = ClientManager.getInstance();

// // API requires no authentication, so use the anonymous
// // authentication provider
// const authProvider = new AnonymousAuthenticationProvider();

// // Define a custom fetch function to set the 'credentials' option.
// // This function wraps the global fetch, but adds our required option.
// const customFetch = (url: Parameters<typeof fetch>[0], init?: RequestInit) => fetch(url, {
// 	...init,
// 	credentials: 'include', // 'include' tells the browser to send cookies
// });

// const httpClient = KiotaClientFactory.create(customFetch);
// const adapter = new FetchRequestAdapter(authProvider, undefined, undefined, httpClient);
// adapter.baseUrl = 'http://localhost:3000';
// export const client = createApiClient(adapter);
