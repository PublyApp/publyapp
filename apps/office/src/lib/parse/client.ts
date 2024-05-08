import ParseRestClient from '@devist/parse-rest-client/ParseRestClient';

import { LOCALE_HEADER_KEY, SESSION_TOKEN_LOCAL_STORAGE_KEY } from '@/shared/lib/constants';
import parseApi from '@/ui-react/api/parse/ParseApi';
import { getInitialLocale } from '@/ui-react/lib/i18n';
import { localStorageGetItem } from '@/ui-react/utils/storage.utils';

import { env } from '../env';

const parseRestClient = new ParseRestClient({
	parseServerUrl: env.PARSE_SERVER_URL,
	applicationId: env.PARSE_APP_ID,
});

export const initParse = () => {
	const locale = getInitialLocale();
	const storedSessionToken = localStorageGetItem(SESSION_TOKEN_LOCAL_STORAGE_KEY);

	// set locale header
	parseRestClient.setHeader(LOCALE_HEADER_KEY, locale);

	// set session token
	parseRestClient.setSessionToken(storedSessionToken);

	parseApi.setRestClient(parseRestClient);
	parseApi.apiPath = env.API_PATH;
};
