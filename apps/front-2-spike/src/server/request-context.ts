import { createServerOnlyFn } from '@tanstack/react-start';
import { getRequestHeader } from '@tanstack/react-start/server';
import * as cookie from 'cookie';
import {
	FALLBACK_LANGUAGE,
	isSupportedLanguage,
	type SupportedLanguage,
} from '~/lib/i18n.shared';
import { getSessionTokensFromCookieHeader } from '~/lib/session-cookie';
import { getSessionTokensFromClient } from '~/lib/session-cookie-client';

import { LOCALE_COOKIE_KEY, isServer } from '@org/shared-ts/lib/constants';

import { createCspForRequest } from './csp';

const THEME_COOKIE_KEY = 'publyapp-theme';

export const getCookieHeader = createServerOnlyFn(() =>
	getRequestHeader('cookie'),
);

export const getSessionTokensIsomorphic = async () => {
	if (isServer) {
		const cookieHeader = await getCookieHeader();
		return getSessionTokensFromCookieHeader(cookieHeader);
	}

	return getSessionTokensFromClient();
};

export const getCookieHeaderIsomorphic = async (): Promise<
	string | undefined
> => {
	if (isServer) {
		const cookieHeader = await getCookieHeader();
		return cookieHeader;
	}

	return document.cookie;
};

export const getThemeFromCookieHeader = (
	cookieHeader: string | undefined,
): 'light' | 'dark' => {
	const parsed = cookie.parse(cookieHeader ?? '');
	return parsed[THEME_COOKIE_KEY] === 'dark' ? 'dark' : 'light';
};

export const getCspConfigForRequest = async () => {
	const { nonce } = await createCspForRequest({
		isDevelopment: process.env.NODE_ENV === 'development',
	});

	return { nonce };
};

export const getLocaleFromCookieHeader = (
	cookieHeader: string | undefined,
): SupportedLanguage => {
	const parsed = cookie.parse(cookieHeader ?? '');
	const locale = parsed[LOCALE_COOKIE_KEY];
	return isSupportedLanguage(locale) ? locale : FALLBACK_LANGUAGE;
};
