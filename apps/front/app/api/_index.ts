import ParseApi from '@devist/ui-react/api/parse/_index';

import { parseRestClient } from '../lib/parse/client';

export const parseApi = new ParseApi({ parseRestClient });
