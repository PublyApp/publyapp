import ParseApi from '@devist/ui-react/api/parse/ParseApi';

import { parseRestClient } from '../lib/parse/client';

export const parseApi = new ParseApi({ parseRestClient });
