import Parse from 'parse';

import { LOCALE_HEADER_KEY } from '@/shared/lib/constants';
import { getInitialLocale } from '@/ui-react/lib/i18n';

import { PARSE_SERVER_URL } from '../constants';
import { env } from '../env';

export const initParse = () => {
	const hasInitializedParse = typeof window.Parse !== 'undefined';

	if (!hasInitializedParse) {
		Parse.initialize(env.PARSE_APP_ID);
		Parse.serverURL = PARSE_SERVER_URL.toString();

		const locale = getInitialLocale();

		Parse.CoreManager.set('REQUEST_HEADERS', {
			[LOCALE_HEADER_KEY]: locale,
		});

		window.Parse = Parse;
	}
};
