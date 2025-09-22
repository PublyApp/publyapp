import { SESSION_TOKEN_COOKIE_KEY } from '@/shared/lib/constants';
import * as cookie from 'cookie';
import _ from 'lodash';
import { clientManager } from './js-client/client-manager';

// const parseRestClient = new ParseRestClient({
// 	applicationId: APP_ID,
// 	parseServerUrl: env.VITE_SERVER_URL + endPoint.api.parse.root,
// });

export const initApiClientOnClient = (/* i18n: I18n */) => {
	// defaultApiClient.setRestClient(parseRestClient);

	const browserCookies = cookie.parse(document.cookie);
	const sessionToken = decodeURIComponent(
		_.get(browserCookies, SESSION_TOKEN_COOKIE_KEY) || '',
	);

	// defaultApiClient.parseRestClient.setSessionToken(sessionToken);
	// defaultApiClient.parseRestClient.setHeader(LOCALE_HEADER_KEY, i18n.language);
	// TODO: set last used tenant id header too

	// return defaultApiClient;
	// let apiClient: ApiClient;

	if (!_.isNil(sessionToken) && !_.isEmpty(sessionToken)) {
		const apiClient = clientManager.createApiClient(sessionToken);
		clientManager.setApiClient(apiClient);
	}

	return clientManager.apiClient;
};

export const initApiClientOnServer = ({
	// locale,
	sessionToken,
	// requestIp,
}: {
	// locale: AppLocale;
	sessionToken?: string;
	// requestIp?: string | null;
}) => {
	// set locale header
	// parseRestClient.setHeader(LOCALE_HEADER_KEY, locale);

	// const apiClient = new ApiClient({
	// 	parseRestClient,
	// });
	const apiClient = clientManager.createApiClient(sessionToken);

	// if (sessionToken) {
	// 	apiClient.parseRestClient.setSessionToken(decodeURIComponent(sessionToken));
	// }

	// if (requestIp) {
	// 	apiClient.parseRestClient.setHeader(REMIX_CLIENT_IP_HEADER_KEY, requestIp);
	// }

	return apiClient;
};
