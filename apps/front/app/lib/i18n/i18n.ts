import { appLocales, defaultLocale, defaultNS, NS, resources } from '@/shared/lib/i18n/resources';

export default {
	supportedLngs: appLocales,
	debug: false,
	resources,
	compatibilityJSON: 'v3' as const,
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
};
