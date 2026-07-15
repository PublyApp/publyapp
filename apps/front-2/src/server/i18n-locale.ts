import { createServerFn } from '@tanstack/react-start';
import { getCookie, setCookie } from '@tanstack/react-start/server';
import { z } from 'zod';
import {
	buildI18nResources,
	FALLBACK_LANGUAGE,
	isSupportedLanguage,
	SUPPORTED_LANGUAGES,
	type SupportedLanguage,
} from '~/lib/i18n.shared';

import { LOCALE_COOKIE_KEY } from '@org/shared-ts/lib/constants';
import duration from '@org/shared-ts/utils/duration.utils';

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

const SetLocaleInputSchema = z.object({
	locale: z.enum(SUPPORTED_LANGUAGES),
});

type SetLocaleInput = z.infer<typeof SetLocaleInputSchema>;

export const setLocale = createServerFn({ method: 'POST' })
	.validator((data): SetLocaleInput => SetLocaleInputSchema.parse(data))
	.handler(async ({ data }) => {
		setCookie(LOCALE_COOKIE_KEY, data.locale, {
			path: '/',
			maxAge: duration.toSeconds('30d'),
		});
		return { locale: data.locale };
	});
