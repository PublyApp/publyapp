import type {
	DefaultLocale,
	DefaultNS,
	SupportedLanguages,
} from '@/shared/lib/i18n/resources';

type Config = {
	debug: boolean;
	compatibilityJSON: 'v4';
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
	supportedLngs: SupportedLanguages;
};

export const config: Config = {
	debug: false,
	compatibilityJSON: 'v4' as const,
	interpolation: {
		escapeValue: false, // not needed for react as it escapes by default
	},
	react: {
		useSuspense: true,
		transSupportBasicHtmlNodes: false,
	},

	defaultNS: 'common',
	fallbackLng: 'en',
	supportedLngs: ['en', 'fr'], // set per environment
	// ns: ['common', 'zod'], // set per environment

	// !!! server only
	// ns: NS, // load all namespaces on server only
	// resources, // load all resources on server only
};
