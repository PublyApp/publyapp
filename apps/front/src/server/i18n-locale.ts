import { createServerFn } from '@tanstack/react-start';
import { getCookie, setCookie } from '@tanstack/react-start/server';
import { z } from 'zod';
import { createBackendI18n, loadI18nContext } from '~/lib/i18n.backend';
import { I18nNamespaceListSchema } from '~/lib/i18n.namespaces';
import {
	FALLBACK_LANGUAGE,
	isSupportedLanguage,
	SUPPORTED_LANGUAGES,
	type SupportedLanguage,
} from '~/lib/i18n.shared';

import { LOCALE_COOKIE_KEY } from '@org/shared-ts/lib/constants';
import duration from '@org/shared-ts/utils/duration.utils';

const resolveLocaleFromCookie = (): SupportedLanguage => {
	const localeFromCookie = getCookie(LOCALE_COOKIE_KEY);
	if (isSupportedLanguage(localeFromCookie)) {
		return localeFromCookie;
	}
	return FALLBACK_LANGUAGE;
};

const LoadI18nInputSchema = z.object({
	namespaces: I18nNamespaceListSchema,
});

type LoadI18nInput = z.infer<typeof LoadI18nInputSchema>;

export const loadI18nForRequest = createServerFn({ method: 'GET' })
	.validator((data): LoadI18nInput => LoadI18nInputSchema.parse(data))
	.handler(async ({ data }) => {
		const locale = resolveLocaleFromCookie();
		const instance = await createBackendI18n(locale);
		return {
			locale,
			...(await loadI18nContext(instance, locale, data.namespaces)),
		};
	});

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
