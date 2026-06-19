import { existsSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { cwd } from 'node:process';
import { fileURLToPath } from 'node:url';

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
// after build (Vite copies `public/`).
const moduleDir = dirname(fileURLToPath(import.meta.url));

const readFront2PackageName = (path: string): string | undefined => {
	try {
		const packageJson = JSON.parse(
			readFileSync(join(path, 'package.json'), 'utf-8'),
		) as { name?: string };
		return packageJson.name;
	} catch {
		return undefined;
	}
};

const resolveAppRoot = (): string => {
	let current = moduleDir;

	for (let i = 0; i < 12; i += 1) {
		const packageName = readFront2PackageName(current);
		if (packageName === 'front-2-spike' && existsSync(join(current, 'src'))) {
			return current;
		}

		const parent = dirname(current);
		if (parent === current) break;
		current = parent;
	}

	const projectRoot = join(cwd(), 'apps', 'front-2-spike');
	if (existsSync(join(projectRoot, 'src'))) return projectRoot;

	return resolve(cwd());
};

const APP_ROOT = resolveAppRoot();

const LOCALHOST_CANDIDATES = [APP_ROOT, moduleDir].flatMap((root) => [
	join(root, 'public', 'locales'),
	join(root, 'dist', 'client', 'locales'),
]);

const LOCALE_DIR_CANDIDATES = Array.from(
	new Set([
		...LOCALHOST_CANDIDATES,
		join(moduleDir, '..', '..', '..', '..', 'public', 'locales'),
	]),
).filter((candidate) => existsSync(candidate));

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
