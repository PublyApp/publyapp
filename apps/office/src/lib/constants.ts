// ----------------------------------------------------------------------

import { endPoint } from '@/shared/lib/constants';
import { getParseCurrentUserLocalStorageKey } from '@/ui-react/lib/constants';

import { env } from './env';

export const HEADER = {
	H_MOBILE: 64,
	H_DESKTOP: 80,
	H_DESKTOP_OFFSET: 80 - 16,
};

export const NAV = {
	W_VERTICAL: 280,
	W_MINI: 88,
};

export const PARSE_CURRENT_USER_LOCAL_STORAGE_KEY = getParseCurrentUserLocalStorageKey(env.PARSE_APP_ID);

export const PARSE_SERVER_URL = new URL(env.SERVER_URL);
PARSE_SERVER_URL.pathname = endPoint.api.parse.root;
