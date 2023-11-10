import i18next from 'i18next';

import { defaultLocale, defaultNS, NS, resources } from '@devist/shared/lib/i18n/resources';

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

export const getT = (locale: string) => {
	return i18next.getFixedT(locale);
};
