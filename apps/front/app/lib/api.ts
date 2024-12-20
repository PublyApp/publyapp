import ParseRestClient from 'packages/parse-rest-client/ParseRestClient';

import { ApiClient } from '@devist/api/ApiClient';

import { endPoint, LOCALE_HEADER_KEY } from '@/shared/lib/constants';
import type { AppLocale } from '@/shared/lib/i18n/resources';

import { env } from './env';

const onServer = ({ locale, sessionToken }: { locale: AppLocale; sessionToken?: string }) => {
	const parseRestClient = new ParseRestClient({
		applicationId: env.VITE_PARSE_APP_ID,
		parseServerUrl: env.VITE_SERVER_URL + endPoint.api.parse.root,
	});

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

export const initApiClient = {
	onServer,
};
