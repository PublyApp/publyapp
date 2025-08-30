import {
	AnonymousAuthenticationProvider,
	ApiKeyAuthenticationProvider,
	ApiKeyLocation,
	type AuthenticationProvider,
} from '@microsoft/kiota-abstractions';
import { FetchRequestAdapter } from '@microsoft/kiota-http-fetchlibrary';
import { type ApiClient, createApiClient } from '@org/js-client/src/apiClient';
import { SESSION_TOKEN_HEADER_KEY } from '@/shared/lib/constants';

class ClientManager {
	private static _instance: ClientManager;

	private static _apiClient: ApiClient;

	get apiClient() {
		if (!ClientManager._apiClient) {
			ClientManager._apiClient = this.createApiClient();
		}
		return ClientManager._apiClient;
	}

	setApiClient(apiClient: ApiClient) {
		ClientManager._apiClient = apiClient;
	}

	private constructor() {}

	public static getInstance() {
		if (!ClientManager._instance) {
			ClientManager._instance = new ClientManager();
		}
		return ClientManager._instance;
	}

	public createApiClient(sessionToken?: string) {
		let authProvider: AuthenticationProvider;
		if (sessionToken) {
			authProvider = new ApiKeyAuthenticationProvider(
				sessionToken,
				SESSION_TOKEN_HEADER_KEY,
				ApiKeyLocation.Header,
			);
		} else {
			authProvider = new AnonymousAuthenticationProvider();
		}
		const adapter = new FetchRequestAdapter(authProvider);
		const apiClient = createApiClient(adapter);
		return apiClient;
	}
}

export const clientManager = ClientManager.getInstance();

// import { AnonymousAuthenticationProvider } from '@microsoft/kiota-abstractions';
// import { FetchRequestAdapter, KiotaClientFactory } from '@microsoft/kiota-http-fetchlibrary';

// import { createClient } from './generated/client.js';

// // API requires no authentication, so use the anonymous
// // authentication provider
// const authProvider = new AnonymousAuthenticationProvider();

// // Define a custom fetch function to set the 'credentials' option.
// // This function wraps the global fetch, but adds our required option.
// const customFetch = (url: Parameters<typeof fetch>[0], init?: RequestInit) => fetch(url, {
//   ...init,
//   credentials: 'include', // 'include' tells the browser to send cookies
// });

// const httpClient = KiotaClientFactory.create(customFetch);
// const adapter = new FetchRequestAdapter(authProvider, undefined, undefined, httpClient);
// adapter.baseUrl = 'http://localhost:3000';
// export const client = createClient(adapter);
