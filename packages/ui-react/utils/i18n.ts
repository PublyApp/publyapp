// import { DEFAULT_LANGUAGE } from '../../utils/constants';
import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';

import { appLocales, defaultLocale, defaultNS, NS, resources, type AppLocale } from '@devist/shared/i18n/resources';

i18n
	.use(initReactI18next) // passes i18n down to react-i18next
	.use(LanguageDetector)
	.init({
		debug: false,
		// debug: process.env.NODE_ENV === 'development',
		resources,
		compatibilityJSON: 'v3',
		// language to use if translations in user language are not available.
		fallbackLng: defaultLocale,
		ns: NS,
		defaultNS,
		interpolation: {
			escapeValue: false, // not needed for react as it escapes by default
		},
		react: {
			useSuspense: false,
			transSupportBasicHtmlNodes: false,
		},
	});

// export const locales = Object.keys(resources);

// export const readOnlyLocales = [...locales] as const;
export const getCurrentLocale = (): AppLocale => {
	// const foundLocale = i18n.languages.find((lang) => {
	// 	return appLocales.indexOf(lang as AppLocale) !== -1;
	// });
	const foundLocale = appLocales.find((locale) => {
		return i18n.languages.indexOf(locale) !== -1;
	});

	return foundLocale || defaultLocale;
};

export default i18n;
