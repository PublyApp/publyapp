import { createInstance, type i18n as I18nInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';

import enResource from '@org/shared-ts/lib/i18n/locales/en';
import frResource from '@org/shared-ts/lib/i18n/locales/fr';

export const SUPPORTED_LANGUAGES = ['en', 'fr'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];
export const FALLBACK_LANGUAGE: SupportedLanguage = 'en';
export const I18N_NAMESPACES = ['common', 'zod', 'response-message'] as const;

export const isSupportedLanguage = (
	value: string | undefined | null,
): value is SupportedLanguage => value === 'en' || value === 'fr';

export const dirForLocale = (lng: string): 'ltr' | 'rtl' =>
	lng === 'ar' ? 'rtl' : 'ltr';

export type JsonValue = string | { [key: string]: JsonValue };

type LocaleResourceBundle = Record<string, JsonValue>;
type LocaleLanguageBundle = Record<string, LocaleResourceBundle>;

export type I18nResources = Record<string, LocaleLanguageBundle>;

const LOCALE_RESOURCES: Record<SupportedLanguage, LocaleLanguageBundle> = {
	en: enResource as LocaleLanguageBundle,
	fr: frResource as LocaleLanguageBundle,
};

export const createI18nFromResources = (
	locale: SupportedLanguage,
	resources: I18nResources,
): I18nInstance => {
	const instance = createInstance();
	void instance.use(initReactI18next).init({
		lng: locale,
		fallbackLng: FALLBACK_LANGUAGE,
		supportedLngs: [...SUPPORTED_LANGUAGES],
		defaultNS: 'common',
		ns: [...I18N_NAMESPACES],
		resources,
		interpolation: { escapeValue: false },
		react: { useSuspense: false },
		// Synchronous init — resources are already in memory.
		initImmediate: false,
	});

	return instance;
};

export const buildI18nResources = async (
	locale: SupportedLanguage,
): Promise<I18nResources> => {
	const resources: I18nResources = {
		[locale]: LOCALE_RESOURCES[locale],
	};

	if (locale !== FALLBACK_LANGUAGE) {
		resources[FALLBACK_LANGUAGE] = LOCALE_RESOURCES[FALLBACK_LANGUAGE];
	}

	return resources;
};
