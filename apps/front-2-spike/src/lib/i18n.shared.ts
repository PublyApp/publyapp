import { createInstance, type i18n as I18nInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';

// =============================================================================
// ISOMORPHIC i18next instance builder — NO node:fs, NO @tanstack/react-start/server
// imports, so it is safe to import from __root.tsx (which renders on server AND client).
//
// Builds a synchronous i18next instance from already-loaded resources. `initImmediate:
// false` makes init synchronous (no async backend), which is what SSR rendering needs.
// =============================================================================

export const SUPPORTED_LANGUAGES = ['en', 'fr'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];
export const FALLBACK_LANGUAGE: SupportedLanguage = 'en';
export const I18N_NAMESPACES = ['common', 'zod', 'response-message'] as const;

export const isSupportedLanguage = (
	value: string | undefined | null,
): value is SupportedLanguage => value === 'en' || value === 'fr';

/** Locale → text direction (only `ar` would be rtl; en/fr are ltr). */
export const dirForLocale = (lng: string): 'ltr' | 'rtl' =>
	lng === 'ar' ? 'rtl' : 'ltr';

// Bounded-depth translation value. Start's server-fn serializer rejects `unknown` and
// chokes on a freely-recursive JSON type ("excessively deep"), so we cap nesting at the
// 3 levels the real locale JSON actually uses (the `zod` namespace nests deepest).
export type JsonValue =
	| string
	| { [key: string]: string | { [key: string]: string } };

/** locale → namespace → key tree (JSON-serializable across the server-fn boundary). */
export type I18nResources = Record<
	string,
	Record<string, Record<string, JsonValue>>
>;

/**
 * Creates a synchronous i18next instance from preloaded resources. Used by __root.tsx
 * on the server (SSR) and re-hydrated on the client with the same resources.
 */
export const createI18nFromResources = (
	locale: SupportedLanguage,
	resources: I18nResources,
): I18nInstance => {
	const instance = createInstance();
	void instance.use(initReactI18next).init({
		lng: locale,
		fallbackLng: FALLBACK_LANGUAGE,
		supportedLngs: [...SUPPORTED_LANGUAGES],
		defaultNS: 'common',
		ns: [...I18N_NAMESPACES],
		resources,
		interpolation: { escapeValue: false },
		react: { useSuspense: false },
		// Synchronous init — resources are already in memory.
		initImmediate: false,
	});
	return instance;
};
