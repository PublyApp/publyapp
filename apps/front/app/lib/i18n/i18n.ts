import { appLocales, defaultLocale, defaultNS } from '@/shared/lib/i18n/resources';

export default {
	// This is the list of languages your application supports
	supportedLngs: appLocales,
	// This is the language you want to use in case
	// if the user language is not in the supportedLngs
	fallbackLng: defaultLocale,
	// The default namespace of i18next is "translation", but you can customize it here
	defaultNS,
};
