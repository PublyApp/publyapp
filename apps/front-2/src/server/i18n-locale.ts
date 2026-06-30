import { createServerFn } from '@tanstack/react-start';
import { getCookie } from '@tanstack/react-start/server';
import {
	buildI18nResources,
	FALLBACK_LANGUAGE,
	isSupportedLanguage,
	type SupportedLanguage,
} from '~/lib/i18n.shared';

import { LOCALE_COOKIE_KEY } from '@org/shared-ts/lib/constants';

const resolveLocaleFromCookie = (): SupportedLanguage => {
	const localeFromCookie = getCookie(LOCALE_COOKIE_KEY);
	return isSupportedLanguage(localeFromCookie)
		? localeFromCookie
		: FALLBACK_LANGUAGE;
};

export const loadI18nForRequest = createServerFn({ method: 'GET' }).handler(
	async () => {
		const locale = resolveLocaleFromCookie();
		const resources = await buildI18nResources(locale);
		return { locale, resources };
	},
);
