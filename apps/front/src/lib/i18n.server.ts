import { parse as parseCookie } from 'cookie';

import { LOCALE_COOKIE_KEY } from '@org/shared-ts/lib/constants';

import {
	FALLBACK_LANGUAGE,
	isSupportedLanguage,
	type SupportedLanguage,
} from './i18n.shared';

const normalizeLocale = (
	value: string | null | undefined,
): SupportedLanguage => {
	return isSupportedLanguage(value) ? value : FALLBACK_LANGUAGE;
};

export const resolveLocaleFromCookie = (
	cookieHeader: string | undefined,
): SupportedLanguage => {
	const parsed = parseCookie(cookieHeader ?? '');
	return normalizeLocale(parsed[LOCALE_COOKIE_KEY]);
};
