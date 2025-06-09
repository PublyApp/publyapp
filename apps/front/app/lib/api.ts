import type { i18n as I18n } from 'i18next';
import ParseRestClient from 'packages/parse-rest-client/ParseRestClient';
import { ApiClient, defaultApiClient } from '@org/api/ApiClient';
import {
	APP_ID,
	endPoint,
	LOCALE_HEADER_KEY,
	SESSION_TOKEN_COOKIE_KEY,
	REMIX_CLIENT_IP_HEADER_KEY,
} from '@/shared/lib/constants';
import type { AppLocale } from '@/shared/lib/i18n/resources';
import { env } from './env';
import * as cookie from 'cookie';
import _ from 'lodash';

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
