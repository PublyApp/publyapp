import i18next from 'i18next';

import { appLocales, defaultLocale, defaultNS, NS, resources, type AppLocale } from '@devist/shared/lib/i18n/resources';

export const initI18next = async () => {
	i18next.init({
		debug: false,
		// debug: process.env.NODE_ENV === 'development',
		resources,
		compatibilityJSON: 'v3',
		fallbackLng: defaultLocale,
		ns: NS,
		defaultNS,
		interpolation: {
			escapeValue: false, // not needed for react as it escapes by default
		},
	});
};

export const getT = (locale: AppLocale) => {
	return i18next.getFixedT(locale);
};

export const getCorrectLocale = (stringInput: string | undefined): AppLocale => {
	return appLocales.includes(stringInput as never) ? (stringInput as AppLocale) : defaultLocale;
};
