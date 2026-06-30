import { parse as parseCookie } from 'cookie';

import {
	FALLBACK_LANGUAGE,
	type I18nResources,
	type JsonValue,
	isSupportedLanguage,
	type SupportedLanguage,
} from './i18n.shared';
import { LOCALE_COOKIE_KEY } from '@org/shared-ts/lib/constants';

import enResource from '@org/shared-ts/lib/i18n/locales/en';
import frResource from '@org/shared-ts/lib/i18n/locales/fr';

type LocaleResourceMap = Record<SupportedLanguage, Record<string, Record<string, JsonValue>>>;

const LOCALE_RESOURCES: LocaleResourceMap = {
	en: enResource,
	fr: frResource,
};

export const normalizeLocale = (value: string | null | undefined): SupportedLanguage =>
	isSupportedLanguage(value) ? value : FALLBACK_LANGUAGE;

export const resolveLocaleFromCookie = (cookieHeader: string | undefined): SupportedLanguage => {
	const parsed = parseCookie(cookieHeader ?? '');
	return normalizeLocale(parsed[LOCALE_COOKIE_KEY]);
};

export const buildI18nResources = async (
	locale: SupportedLanguage,
): Promise<I18nResources> => {
	const resources: I18nResources = { [locale]: LOCALE_RESOURCES[locale] };

	if (locale !== FALLBACK_LANGUAGE) {
		resources[FALLBACK_LANGUAGE] = LOCALE_RESOURCES[FALLBACK_LANGUAGE];
	}

	return resources;
};
