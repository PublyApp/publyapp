import ParseRestClient from '@devist/parse-rest-client/ParseRestClient';
import parseApi from '@devist/ui-react/api/parse/ParseApi';

import { env } from '../env';

const parseRestClient = new ParseRestClient({
	parseServerUrl: env.VITE_PARSE_SERVER_URL,
	applicationId: env.VITE_PARSE_APP_ID,
});

export const initParse = () => {
	parseApi.setRestClient(parseRestClient);
};
