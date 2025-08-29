import {
	AnonymousAuthenticationProvider,
	ApiKeyAuthenticationProvider,
	ApiKeyLocation,
	type AuthenticationProvider,
} from '@microsoft/kiota-abstractions';
import { FetchRequestAdapter } from '@microsoft/kiota-http-fetchlibrary';
import { type ApiClient, createApiClient } from '@org/js-client/src/apiClient';

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
				'X-Session-Token',
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
