import {
	createInstance,
	type i18n as I18nInstance,
	type Resource,
} from 'i18next';
import { initReactI18next } from 'react-i18next';

import type { SupportedNamespace } from './i18n.namespaces';

export const SUPPORTED_LANGUAGES = ['en', 'fr'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];
export const FALLBACK_LANGUAGE: SupportedLanguage = 'en';

export const isSupportedLanguage = (
	value: string | undefined | null,
): value is SupportedLanguage => value === 'en' || value === 'fr';

// Language names are displayed in their own tongue, not translated per-locale.
export const LOCALE_LABELS = {
	en: 'English',
	fr: 'Français',
} satisfies Record<SupportedLanguage, string>;

export const dirForLocale = (lng: string): 'ltr' | 'rtl' =>
	lng === 'ar' ? 'rtl' : 'ltr';

type JsonValue = string | { [key: string]: JsonValue };
export type NamespaceResource = Record<string, JsonValue>;
export type I18nResources = Partial<
	Record<
		SupportedLanguage,
		Partial<Record<SupportedNamespace, NamespaceResource>>
	>
>;
export type I18nLoadResult = {
	namespaces: SupportedNamespace[];
	resources: I18nResources;
	namespaceLoadError: string | null;
};

export const createI18nFromResources = (
	locale: SupportedLanguage,
	namespaces: readonly SupportedNamespace[],
	resources: I18nResources,
): I18nInstance => {
	const instance = createInstance();
	void instance.use(initReactI18next).init({
		lng: locale,
		fallbackLng: false,
		supportedLngs: [...SUPPORTED_LANGUAGES],
		defaultNS: 'common',
		ns: [...namespaces],
		resources: resources as Resource,
		interpolation: { escapeValue: false },
		react: { useSuspense: false },
		initAsync: false,
	});
	return instance;
};
