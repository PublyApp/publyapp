import * as cookie from 'cookie';
import _ from 'lodash';
import {
	LANGUAGE_DETECTION_METHOD,
	LANGUAGE_DETECTION_METHOD_ENUM,
	LOCALE_COOKIE_KEY,
	queryParamKey,
} from '@/shared/lib/constants';
import { getCorrectLocale } from '@/shared/lib/i18n/i18n.utils';
import { SilentPostHog } from '@/shared/lib/posthog/silent-posthog';
import { logger } from '@/shared/lib/winston.server';
import { nanoid } from 'nanoid';
import type { AppLoadContext } from 'react-router';

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

export const getDevContext = (loadContext: AppLoadContext) => {
	let finalLoadContext: AppLoadContext;

	if (import.meta.env.DEV) {
		finalLoadContext = {
			logger: logger,
			postHogServer: new SilentPostHog(),
			___NONCE___: nanoid(),
			...(loadContext as Record<string, unknown>), // keep the original load context if there are any values in it
		};
	} else {
		finalLoadContext = loadContext;
	}

	return finalLoadContext;
};
