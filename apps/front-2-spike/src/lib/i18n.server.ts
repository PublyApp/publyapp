import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { cwd } from 'node:process';

import { getCookie } from '@tanstack/react-start/server';

import { LOCALE_COOKIE_KEY } from '@org/shared-ts/lib/constants';

import {
	FALLBACK_LANGUAGE,
	I18N_NAMESPACES,
	type I18nResources,
	isSupportedLanguage,
	type JsonValue,
	type SupportedLanguage,
} from './i18n.shared';

// =============================================================================
// i18next SSR resource loader — COOKIE-DRIVEN locale, en fallback.
//
// SERVER-ONLY (uses node:fs + @tanstack/react-start/server). Consumed exclusively
// through the `loadI18nForRequest` server fn (src/server/i18n-locale.server.ts) so it
// never leaks into the client bundle. Reads the SAME JSON the browser fetches from
// public/locales/{lng}/{ns}.json.
// =============================================================================

/** Resolves the request locale from the `publyapp-locale` cookie, with en fallback. */
export const resolveLocaleFromCookie = (): SupportedLanguage => {
	const cookieLocale = getCookie(LOCALE_COOKIE_KEY);
	return isSupportedLanguage(cookieLocale) ? cookieLocale : FALLBACK_LANGUAGE;
};

// The server is launched from the app root (cwd), where the locale JSON lives at
// `public/locales/{lng}/{ns}.json` in dev and is mirrored to `dist/client/locales/...`
// after build (Vite copies `public/`). Resolving from cwd works in BOTH — bundle-path
// resolution (`import.meta.url`) breaks because the server fn is chunked into
// `dist/server/assets/`, where `../../public/locales` does not exist.
const LOCALE_DIR_CANDIDATES = [
	join(cwd(), 'public', 'locales'),
	join(cwd(), 'dist', 'client', 'locales'),
];

const loadNamespace = async (
	lng: SupportedLanguage,
	ns: string,
): Promise<Record<string, JsonValue>> => {
	for (const root of LOCALE_DIR_CANDIDATES) {
		try {
			const raw = await readFile(join(root, lng, `${ns}.json`), 'utf-8');
			return JSON.parse(raw) as Record<string, JsonValue>;
		} catch {
			// Try the next candidate root.
		}
	}
	return {};
};

const loadLanguage = async (
	lng: SupportedLanguage,
): Promise<Record<string, Record<string, JsonValue>>> => {
	const out: Record<string, Record<string, JsonValue>> = {};
	for (const ns of I18N_NAMESPACES) {
		out[ns] = await loadNamespace(lng, ns);
	}
	return out;
};

/**
 * Builds the SSR resources for a locale (always including the fallback language so
 * missing keys resolve to English).
 */
export const buildI18nResources = async (
	locale: SupportedLanguage,
): Promise<I18nResources> => {
	const resources: I18nResources = { [locale]: await loadLanguage(locale) };
	if (locale !== FALLBACK_LANGUAGE) {
		resources[FALLBACK_LANGUAGE] = await loadLanguage(FALLBACK_LANGUAGE);
	}
	return resources;
};
