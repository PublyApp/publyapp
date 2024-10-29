import i18next from 'i18next';

import { appLocales, defaultLocale, defaultNS, NS, resources, type AppLocale } from '@devist/shared/lib/i18n/resources';

let IS_INITIALIZED = false;

export const initI18next = async () => {
	if (IS_INITIALIZED) {
		return;
	}

	await i18next.init({
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

	IS_INITIALIZED = true;
};

// ! it's important to immediately initialize;
initI18next();

export const getT = (locale: AppLocale) => {
	return i18next.getFixedT(locale);
};

export const getCorrectLocale = (stringInput: string | undefined): AppLocale => {
	return appLocales.includes(stringInput as never) ? (stringInput as AppLocale) : defaultLocale;
};

export const i18nextServer = i18next;
