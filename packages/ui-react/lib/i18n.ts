import i18next from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';

// import HttpBackend from 'i18next-http-backend';

import { appLocales, defaultLocale, defaultNS, NS, resources, type AppLocale } from '@devist/shared/lib/i18n/resources';

import { localStorageGetItem } from '../utils/storage.utils';

export const initI18next = () => {
	i18next
		.use(LanguageDetector)
		// .use(HttpBackend)
		.use(initReactI18next) // passes i18n down to react-i18next
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
				useSuspense: true,
				transSupportBasicHtmlNodes: false,
				// bindI18nStore: 'languageChanged',
				// bindI18n: 'added',
			},
		});
};

export const getCurrentLocale = (): AppLocale => {
	const foundLocale = appLocales.find((locale) => {
		return i18next.languages.indexOf(locale) !== -1;
	});

	return foundLocale || defaultLocale;
};

/**
 * Get the locale from the local storage
 * Used to set the locale when the app starts
 */
export const getInitialLocale = (): AppLocale => {
	const storedLocale = localStorageGetItem('i18nextLng');
	const locale = appLocales.includes(storedLocale as never) ? storedLocale! : defaultLocale;

	return locale as never;
};

export const i18nextClient = i18next;
