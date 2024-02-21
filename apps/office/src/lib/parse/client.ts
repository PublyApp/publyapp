import ParseRestClient from '@devist/parse-rest-client/ParseRestClient';

import { LOCALE_HEADER_KEY } from '@/shared/lib/constants';
import { getInitialLocale } from '@/ui-react/lib/i18n';

import { env } from '../env';

export const parseRestClient = new ParseRestClient({
	parseServerUrl: env.PARSE_SERVER_URL,
	applicationId: env.PARSE_APP_ID,
});

export const initParse = () => {
	const locale = getInitialLocale();

	// se locale header
	parseRestClient.setHeader(LOCALE_HEADER_KEY, locale);
};
