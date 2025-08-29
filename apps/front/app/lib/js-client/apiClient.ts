// @example at: https://github.com/microsoft/kiota-samples/blob/main/get-started/quickstart/typescript/index.ts

import {
	AnonymousAuthenticationProvider,
	HttpMethod,
	RequestInformation,
} from '@microsoft/kiota-abstractions';
import { FetchRequestAdapter } from '@microsoft/kiota-http-fetchlibrary';
import { createApiClient } from '@org/js-client/src/apiClient';

// authentication provider
const authProvider = new AnonymousAuthenticationProvider();
// const apiKeyAuthProvider = new ApiKeyAuthenticationProvider('my-api-key', 'X-Session-Token', ApiKeyLocation.Header);
// Create request adapter using the fetch-based implementation
const adapter = new FetchRequestAdapter(authProvider);

export const apiClientDefault = createApiClient(adapter);

apiClientDefault.auth.login.post(
	{
		email: {
			getValue() {
				return 'test@test.com';
			},
		},
		password: {
			getValue() {
				return 'test';
			},
		},
	},
	{ options: [] },
);
