import i18next, { type i18n as I18nInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';

import InterZod from '@org/shared-ts/lib/zod/InterZod';

import {
	FALLBACK_LANGUAGE,
	I18N_NAMESPACES,
	isSupportedLanguage,
	SUPPORTED_LANGUAGES,
	type SupportedLanguage,
} from './i18n.shared';

// =============================================================================
// i18next CLIENT init + InterZod wiring.
//
// The locale is read from the SSR-rendered `<html lang>` attribute (the server already
// resolved it from the `publyapp-locale` cookie), so client + server agree. Resources
// are fetched from public/locales/{lng}/{ns}.json. InterZod resolves Zod validation
// errors through the `zod` namespace (e.g. `zod:string.email` via zod-i18n-map).
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

// Lazily built so the bundle doesn't double-init across HMR.
// InterZod's `I18nLike` is typed for a single-namespace TFunction; the global i18next
// `t` is the broader default-namespace function. The shapes are runtime-compatible
// (InterZod only calls `i18n.t` / `i18n.getFixedT`), so cast the constructor arg.
export const interZodClient = new InterZod({
	i18n: i18next as unknown as ConstructorParameters<typeof InterZod>[0]['i18n'],
});

let initialized = false;

export const initI18nOnClient = async (): Promise<I18nInstance> => {
	if (initialized) return i18next;

	const htmlLang = document.documentElement.lang;
	const locale: SupportedLanguage = isSupportedLanguage(htmlLang)
		? htmlLang
		: FALLBACK_LANGUAGE;

	const resources: Record<string, Record<string, unknown>> = {};
	for (const ns of I18N_NAMESPACES) {
		resources[ns] = await fetchNamespace(locale, ns);
	}

	await i18next.use(initReactI18next).init({
		lng: locale,
		fallbackLng: FALLBACK_LANGUAGE,
		supportedLngs: [...SUPPORTED_LANGUAGES],
		defaultNS: 'common',
		ns: [...I18N_NAMESPACES],
		resources: { [locale]: resources },
		interpolation: { escapeValue: false },
		react: { useSuspense: false },
	});

	// Point InterZod at the resolved locale so zod errors translate.
	interZodClient.setLocale(locale);

	initialized = true;
	return i18next;
};
