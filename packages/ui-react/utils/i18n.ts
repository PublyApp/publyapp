// import { DEFAULT_LANGUAGE } from '../../utils/constants';
import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';

import { defaultLocale, defaultNS, NS, resources } from '@devist/shared/i18n/resources';

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

export const locales = Object.keys(resources);

// export const readOnlyLocales = [...locales] as const;
export const getCurrentLocale = (): any => {
	return i18n.languages.find((lang: any) => {
		return locales.indexOf(lang) !== -1;
	});
};

export default i18n;
