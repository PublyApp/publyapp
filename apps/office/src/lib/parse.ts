import Parse from 'parse';

import { LOCALE_HEADER_KEY } from '@/shared/lib/constants';
import { defaultLocale } from '@/shared/lib/i18n/resources';
import { localStorageGetItem } from '@/ui-react/utils/storage.utils';

import { env } from './env';

export const initParse = () => {
	const hasInitializedParse = typeof window.Parse !== 'undefined';

	if (!hasInitializedParse) {
		Parse.initialize(env.PARSE_APP_ID);
		Parse.serverURL = env.PARSE_SERVER_URL;

		Parse.CoreManager.set('REQUEST_HEADERS', {
			[LOCALE_HEADER_KEY]: localStorageGetItem('i18nextLng') || defaultLocale,
		});

		window.Parse = Parse;
	}
};
