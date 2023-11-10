// import { DEFAULT_LANGUAGE } from '../../utils/constants';
import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';

import { appLocales, defaultLocale, defaultNS, NS, resources, type AppLocale } from '@devist/shared/lib/i18n/resources';

export const initReactLocalization = () => {
	i18n
		.use(LanguageDetector)
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
				useSuspense: false,
				transSupportBasicHtmlNodes: false,
			},
		});
};

export const getCurrentLocale = (): AppLocale => {
	const foundLocale = appLocales.find((locale) => {
		return i18n.languages.indexOf(locale) !== -1;
	});

	return foundLocale || defaultLocale;
};

export default i18n;
