import ParseRestClient from '@devist/parse-rest-client/ParseRestClient';

import { env } from '../env';

export const parseApi = new ParseRestClient({
	parseServerUrl: env.VITE_PARSE_SERVER_URL,
	applicationId: env.VITE_PARSE_APP_ID,
});
