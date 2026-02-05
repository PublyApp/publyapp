import * as cookie from 'cookie';
import _ from 'lodash';

import {
	LANGUAGE_DETECTION_METHOD,
	LANGUAGE_DETECTION_METHOD_ENUM,
	LOCALE_COOKIE_KEY,
	queryParamKey,
} from '@/shared/lib/constants';
import { getCorrectLocale } from '@/shared/lib/i18n/i18n.utils';

export const getRequestLocale = (request: Request) => {
	if (
		LANGUAGE_DETECTION_METHOD === LANGUAGE_DETECTION_METHOD_ENUM.QUERY_PARAM
	) {
		const url = new URL(request.url);
		const language = url.searchParams.get(queryParamKey.language);
		const locale = getCorrectLocale(language);
		return locale;
	}

	const reqCookies = cookie.parse(request.headers.get('cookie') || '');
	const localeCookie = _.get(reqCookies, LOCALE_COOKIE_KEY);
	const locale = getCorrectLocale(localeCookie);
	return locale;
};
