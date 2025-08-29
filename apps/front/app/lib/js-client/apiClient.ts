// @example at: https://github.com/microsoft/kiota-samples/blob/main/get-started/quickstart/typescript/index.ts

import { AnonymousAuthenticationProvider } from '@microsoft/kiota-abstractions';
import { FetchRequestAdapter } from '@microsoft/kiota-http-fetchlibrary';
import { createApiClient } from '@org/js-client/src/apiClient';

// authentication provider
const authProvider = new AnonymousAuthenticationProvider();
// const apiKeyAuthProvider = new ApiKeyAuthenticationProvider('my-api-key', 'X-Session-Token', ApiKeyLocation.Header);
// Create request adapter using the fetch-based implementation
const adapter = new FetchRequestAdapter(authProvider);

// const requestInfo = new RequestInformation();
// requestInfo.urlTemplate = '/api/v1/auth/login';
// requestInfo.httpMethod = HttpMethod.POST;
// requestInfo.setContentFromScalar(adapter, 'application/json', 'test');

// authProvider.authenticateRequest(requestInfo);

export const apiClientDefault = createApiClient(adapter);

apiClientDefault.staff.tenants.post({
	name: {
		getValue() {
			return 'test';
		},
		value: 'test',
	},
});
