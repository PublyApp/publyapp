import { createInstance, type i18n as I18nInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';

export const SUPPORTED_LANGUAGES = ['en', 'fr'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];
export const FALLBACK_LANGUAGE: SupportedLanguage = 'en';
export const I18N_NAMESPACES = ['common', 'zod', 'response-message'] as const;

export const isSupportedLanguage = (
	value: string | undefined | null,
): value is SupportedLanguage => value === 'en' || value === 'fr';

export const dirForLocale = (lng: string): 'ltr' | 'rtl' =>
	lng === 'ar' ? 'rtl' : 'ltr';

export type JsonValue =
	| string
	| {
			[key: string]: string | { [key: string]: string };
	};

export type I18nResources = Record<
	string,
	Record<string, Record<string, JsonValue>>
>;

export const createI18nFromResources = (
	locale: SupportedLanguage,
	resources: I18nResources,
): Promise<I18nInstance> => {
	const initialize = async () => {
		const instance = createInstance();
		await instance.use(initReactI18next).init({
			lng: locale,
			fallbackLng: FALLBACK_LANGUAGE,
			supportedLngs: [...SUPPORTED_LANGUAGES],
			defaultNS: 'common',
			ns: [...I18N_NAMESPACES],
			resources,
			interpolation: { escapeValue: false },
			react: { useSuspense: false },
			initImmediate: false,
		});

		return instance;
	};

	return initialize();
};
