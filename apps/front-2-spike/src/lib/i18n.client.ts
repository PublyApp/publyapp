import i18next, { type i18n as I18nInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';
import { z } from 'zod';

import InterZod from '@org/shared-ts/lib/zod/InterZod';

import {
	FALLBACK_LANGUAGE,
	I18N_NAMESPACES,
	isSupportedLanguage,
	SUPPORTED_LANGUAGES,
	type SupportedLanguage,
} from './i18n.shared';

type InterZodOptions = ConstructorParameters<typeof InterZod>[0];

type InterZodI18nLike = InterZodOptions['i18n'];

// =============================================================================
// i18next CLIENT init + InterZod wiring.
//
// InterZod is bound to the active i18next instance used by `__root.tsx` so Zod errors
// resolve against the same runtime locale and namespace resources.
// =============================================================================

const fetchNamespace = async (
	lng: SupportedLanguage,
	ns: string,
): Promise<Record<string, unknown>> => {
	try {
		const res = await fetch(`/locales/${lng}/${ns}.json`);
		if (!res.ok) return {};
		return (await res.json()) as Record<string, unknown>;
	} catch {
		return {};
	}
};

let activeClientI18n: I18nInstance = i18next;
let activeLocale = FALLBACK_LANGUAGE;
let initialized = false;

const bindInterZodToI18n = (
	instance: I18nInstance,
	locale: SupportedLanguage,
) => {
	const i18nLike: InterZodI18nLike = {
		getFixedT: instance.getFixedT.bind(instance),
		t: instance.t.bind(instance) as never,
	};

	return new InterZod({
		i18n: i18nLike,
		locale,
	});
};

export let interZodClient = bindInterZodToI18n(activeClientI18n, activeLocale);

// Install InterZod's locale-aware error map as zod's GLOBAL error map so plain
// `z.*` schemas (e.g. in the dialog, which must not import this `.client` module)
// produce translated validation messages. Re-applied on locale change below.
z.setErrorMap(interZodClient.getErrorMap());

const resolveLocale = (value: string | undefined): SupportedLanguage =>
	isSupportedLanguage(value) ? value : FALLBACK_LANGUAGE;

export const initI18nOnClient = async (
	instance?: I18nInstance,
): Promise<I18nInstance> => {
	const i18n = instance ?? activeClientI18n;
	const htmlLang =
		typeof document !== 'undefined' ? document.documentElement.lang : undefined;
	const activeLang = i18n.language ?? i18n.resolvedLanguage ?? i18n.options.lng;
	const candidate = isSupportedLanguage(htmlLang) ? htmlLang : activeLang;
	const locale = resolveLocale(
		typeof candidate === 'string' ? candidate : undefined,
	);

	if (initialized && activeClientI18n === i18n && activeLocale === locale) {
		return i18n;
	}

	activeClientI18n = i18n;
	activeLocale = locale;

	if (!i18n.isInitialized) {
		const resources: Record<string, Record<string, unknown>> = {};
		for (const ns of I18N_NAMESPACES) {
			resources[ns] = await fetchNamespace(locale, ns);
		}

		await i18n.use(initReactI18next).init({
			lng: locale,
			fallbackLng: FALLBACK_LANGUAGE,
			supportedLngs: [...SUPPORTED_LANGUAGES],
			defaultNS: 'common',
			ns: [...I18N_NAMESPACES],
			resources: { [locale]: resources },
			interpolation: { escapeValue: false },
			react: { useSuspense: false },
		});
	}

	interZodClient = bindInterZodToI18n(i18n, locale);
	z.setErrorMap(interZodClient.getErrorMap());
	initialized = true;
	return i18n;
};
