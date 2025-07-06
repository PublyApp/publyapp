import { ApiClient, defaultApiClient } from '@/parse-api-client/ApiClient';
import {
	APP_ID,
	LOCALE_HEADER_KEY,
	REMIX_CLIENT_IP_HEADER_KEY,
	SESSION_TOKEN_COOKIE_KEY,
	endPoint,
} from '@/shared/lib/constants';
import type { AppLocale } from '@/shared/lib/i18n/resources';
import * as cookie from 'cookie';
import type { i18n as I18n } from 'i18next';
import _ from 'lodash';
import ParseRestClient from 'packages/parse-rest-client/ParseRestClient';
import { env } from './env';

const parseRestClient = new ParseRestClient({
	applicationId: APP_ID,
	parseServerUrl: env.VITE_SERVER_URL + endPoint.api.parse.root,
});

export const initApiClientOnClient = (i18n: I18n) => {
	defaultApiClient.setRestClient(parseRestClient);

	const browserCookies = cookie.parse(document.cookie);
	const sessionToken = decodeURIComponent(
		_.get(browserCookies, SESSION_TOKEN_COOKIE_KEY) || '',
	);

	defaultApiClient.parseRestClient.setSessionToken(sessionToken);
	defaultApiClient.parseRestClient.setHeader(LOCALE_HEADER_KEY, i18n.language);
	// TODO: set last used tenant id header too

	return defaultApiClient;
};

export const initApiClientOnServer = ({
	locale,
	sessionToken,
	requestIp,
}: {
	locale: AppLocale;
	sessionToken?: string;
	requestIp?: string | null;
}) => {
	// set locale header
	parseRestClient.setHeader(LOCALE_HEADER_KEY, locale);

	const apiClient = new ApiClient({
		parseRestClient,
	});

	if (sessionToken) {
		apiClient.parseRestClient.setSessionToken(decodeURIComponent(sessionToken));
	}

	if (requestIp) {
		apiClient.parseRestClient.setHeader(REMIX_CLIENT_IP_HEADER_KEY, requestIp);
	}

	return apiClient;
};
