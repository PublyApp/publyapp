import i18next from 'i18next';

import {
	defaultLocale,
	defaultNS,
	NS,
	resources,
	type AppLocale,
} from '@org/shared/lib/i18n/resources';

let IS_INITIALIZED = false;

export const initI18next = async () => {
	if (IS_INITIALIZED) {
		return;
	}

	await i18next.init({
		debug: false,
		resources,
		compatibilityJSON: 'v4',
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

export const i18nextServer = i18next;
