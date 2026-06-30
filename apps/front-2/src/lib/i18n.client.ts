import i18next, { type i18n as I18nInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';
import { z } from 'zod';

import InterZod from '@org/shared-ts/lib/zod/InterZod';
import {
	FALLBACK_LANGUAGE,
	type SupportedLanguage,
	I18N_NAMESPACES,
	isSupportedLanguage,
	SUPPORTED_LANGUAGES,
} from './i18n.shared';
import type { I18nResources } from './i18n.shared';

import enResource from '@org/shared-ts/lib/i18n/locales/en';
import frResource from '@org/shared-ts/lib/i18n/locales/fr';

type LocaleResourceBundle = I18nResources[string];
type InterZodOptions = ConstructorParameters<typeof InterZod>[0];
type InterZodI18nLike = InterZodOptions['i18n'];

const embeddedResources: Record<SupportedLanguage, LocaleResourceBundle> = {
	en: enResource,
	fr: frResource,
};

const bindInterZodToI18n = (instance: I18nInstance, locale: SupportedLanguage) => {
	const i18nLike: InterZodI18nLike = {
		getFixedT: instance.getFixedT.bind(instance),
		t: instance.t.bind(instance) as never,
	};

	return new InterZod({
		i18n: i18nLike,
		locale,
	});
};

let activeClientI18n: I18nInstance = i18next;
let activeLocale: SupportedLanguage = FALLBACK_LANGUAGE;
let initialized = false;

let interZodClient = bindInterZodToI18n(activeClientI18n, activeLocale);
z.setErrorMap(interZodClient.getErrorMap());

const resolveLocale = (value: string | undefined): SupportedLanguage =>
	isSupportedLanguage(value) ? value : FALLBACK_LANGUAGE;

export const initI18nOnClient = async (
	instance?: I18nInstance,
): Promise<I18nInstance> => {
	const i18n = instance ?? activeClientI18n;
	const htmlLocale =
		typeof document !== 'undefined' ? document.documentElement.lang : undefined;
	const activeLocaleCandidate =
		i18n.options.lng && typeof i18n.options.lng === 'string'
			? i18n.options.lng
			: undefined;
	const locale = resolveLocale(
		isSupportedLanguage(htmlLocale) ? htmlLocale : activeLocaleCandidate,
	);

	if (initialized && activeClientI18n === i18n && activeLocale === locale) {
		return i18n;
	}

	activeClientI18n = i18n;
	activeLocale = locale;

	if (!i18n.isInitialized) {
		await i18n.use(initReactI18next).init({
			lng: locale,
			fallbackLng: FALLBACK_LANGUAGE,
			supportedLngs: [...SUPPORTED_LANGUAGES],
			defaultNS: 'common',
			ns: [...I18N_NAMESPACES],
			resources: {
				en: embeddedResources.en,
				fr: embeddedResources.fr,
			},
			interpolation: { escapeValue: false },
			react: { useSuspense: false },
		});
	}

	interZodClient = bindInterZodToI18n(i18n, locale);
	z.setErrorMap(interZodClient.getErrorMap());

	initialized = true;
	return i18n;
};
