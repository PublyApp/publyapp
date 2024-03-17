import ParseApi from '@devist/ui-react/api/parse/ParseApi';

import { http } from '../lib/axios/http';
import { parseRestClient } from '../lib/parse/client';

const parseApi = new ParseApi({ parseRestClient });

const clients = {
	parseApi,
	http,
};

export default clients;
