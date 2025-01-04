import i18next from 'i18next';
import ParseRestClient from 'packages/parse-rest-client/ParseRestClient';

import { ApiClient, defaultApiClient } from '@devist/api/ApiClient';

import { endPoint, LOCALE_HEADER_KEY, SESSION_TOKEN_COOKIE_KEY } from '@/shared/lib/constants';
import type { AppLocale } from '@/shared/lib/i18n/resources';

import { getBrowserCookie } from '../utils/web.utils';

import { env } from './env';

const parseRestClient = new ParseRestClient({
	applicationId: env.VITE_PARSE_APP_ID,
	parseServerUrl: env.VITE_SERVER_URL + endPoint.api.parse.root,
});

const onServer = ({ locale, sessionToken }: { locale: AppLocale; sessionToken?: string }) => {
	// set locale header
	parseRestClient.setHeader(LOCALE_HEADER_KEY, locale);

	const apiClient = new ApiClient({
		parseRestClient,
	});

	if (sessionToken) {
		apiClient.parseRestClient.setSessionToken(sessionToken);
	}

	return apiClient;
};

const onClient = () => {
	defaultApiClient.setRestClient(parseRestClient);

	const sessionToken = getBrowserCookie(SESSION_TOKEN_COOKIE_KEY);

	defaultApiClient.parseRestClient.setSessionToken(sessionToken);
	defaultApiClient.parseRestClient.setHeader(LOCALE_HEADER_KEY, i18next.language);
	// TODO: set last used tenant id header too
};

export const initApiClient = {
	onServer,
	onClient,
};
