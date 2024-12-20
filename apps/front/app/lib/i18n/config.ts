import { type DefaultLocale, type DefaultNS, type Namespaces } from '@/shared/lib/i18n/resources';

type Config = {
	debug: boolean;
	compatibilityJSON: 'v3';
	interpolation: {
		escapeValue: boolean;
	};
	react: {
		useSuspense: boolean;
		transSupportBasicHtmlNodes: boolean;
	};

	// ns: Namespaces;
	defaultNS: DefaultNS;
	fallbackLng: DefaultLocale;
};

export const config: Config = {
	debug: false,
	compatibilityJSON: 'v3' as const,
	interpolation: {
		escapeValue: false, // not needed for react as it escapes by default
	},
	react: {
		useSuspense: true,
		transSupportBasicHtmlNodes: false,
	},

	defaultNS: 'common',
	fallbackLng: 'en',
	// ns: ['common', 'zod'], // set per environment

	// !!! server only
	// ns: NS, // load all namespaces on server only
	// resources, // load all resources on server only
	// supportedLngs: appLocales, // import appLocales on server only
};
