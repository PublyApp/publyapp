import { createServerFn } from '@tanstack/react-start';
import { getCookie, setCookie } from '@tanstack/react-start/server';
import { compile, z } from 'zod';

import { LOCALE_COOKIE_KEY } from '@org/shared-ts/lib/constants';
import {
	createBackendI18n,
	loadI18nContext,
} from '@org/shared-ts/lib/i18n/backend';
import { I18nNamespaceListSchema } from '@org/shared-ts/lib/i18n/namespaces';
import {
	FALLBACK_LANGUAGE,
	isSupportedLanguage,
	SUPPORTED_LANGUAGES,
	type SupportedLanguage,
} from '@org/shared-ts/lib/i18n/shared';
import duration from '@org/shared-ts/utils/duration.utils';

const resolveLocaleFromCookie = (): SupportedLanguage => {
	const localeFromCookie = getCookie(LOCALE_COOKIE_KEY);
	if (isSupportedLanguage(localeFromCookie)) {
		return localeFromCookie;
	}
	return FALLBACK_LANGUAGE;
};

const buildLoadI18nInputSchema = () =>
	compile(
		z.object({
			namespaces: I18nNamespaceListSchema,
		}),
	);

let compiledLoadI18nInput:
	| ReturnType<typeof buildLoadI18nInputSchema>
	| undefined;
const getLoadI18nInputSchema = () =>
	(compiledLoadI18nInput ??= buildLoadI18nInputSchema());

type LoadI18nInput = z.infer<ReturnType<typeof buildLoadI18nInputSchema>>;

export const loadI18nForRequest = createServerFn({ method: 'GET' })
	.validator((data): LoadI18nInput => getLoadI18nInputSchema().parse(data))
	.handler(async ({ data }) => {
		const locale = resolveLocaleFromCookie();
		const instance = await createBackendI18n(locale);
		return {
			locale,
			...(await loadI18nContext(instance, locale, data.namespaces)),
		};
	});

const buildSetLocaleInputSchema = () =>
	compile(
		z.object({
			locale: z.enum(SUPPORTED_LANGUAGES),
		}),
	);

let compiledSetLocaleInput:
	| ReturnType<typeof buildSetLocaleInputSchema>
	| undefined;
const getSetLocaleInputSchema = () =>
	(compiledSetLocaleInput ??= buildSetLocaleInputSchema());

type SetLocaleInput = z.infer<ReturnType<typeof buildSetLocaleInputSchema>>;

export const setLocale = createServerFn({ method: 'POST' })
	.validator((data): SetLocaleInput => getSetLocaleInputSchema().parse(data))
	.handler(async ({ data }) => {
		setCookie(LOCALE_COOKIE_KEY, data.locale, {
			path: '/',
			maxAge: duration.toSeconds('30d'),
		});
		return { locale: data.locale };
	});
