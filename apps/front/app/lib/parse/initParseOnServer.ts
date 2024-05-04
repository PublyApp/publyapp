import ParseRestClient from 'packages/parse-rest-client/ParseRestClient';

import { LOCALE_HEADER_KEY } from '@/shared/lib/constants';
import type { AppLocale } from '@/shared/lib/i18n/resources';
import { ParseApi } from '@/ui-react/api/parse/ParseApi';

import { env } from '../env';

export const initParseOnServer = async ({ locale }: { locale: AppLocale }) => {
	const parseApi = new ParseApi();

	const parseRestClient = new ParseRestClient({
		applicationId: env.VITE_PARSE_APP_ID,
		parseServerUrl: env.VITE_PARSE_SERVER_URL,
	});

	// set locale header
	parseRestClient.setHeader(LOCALE_HEADER_KEY, locale);

	parseApi.setRestClient(parseRestClient);

	return parseApi;
};
