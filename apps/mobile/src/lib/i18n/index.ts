import { getLocales } from 'expo-localization';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import {
	FALLBACK_LANGUAGE as SOURCE_LANGUAGE,
	isSupportedLanguage,
	type SupportedLanguage,
} from '@org/shared-ts/lib/i18n/shared';

import { readStoredLanguage, writeStoredLanguage } from './language-storage';
import { resources } from './resources';

/** Neither French nor English on the phone: French (owner decision, #2378). */
const DEFAULT_LANGUAGE: SupportedLanguage = 'fr';

const detectDeviceLanguage = (): SupportedLanguage => {
	const code = getLocales()[0]?.languageCode;
	return isSupportedLanguage(code) ? code : DEFAULT_LANGUAGE;
};

const readInitialLanguage = async (): Promise<SupportedLanguage> => {
	try {
		const stored = await readStoredLanguage();
		if (isSupportedLanguage(stored)) {
			return stored;
		}
	} catch (error) {
		console.warn('Could not read the saved language', error);
	}
	return detectDeviceLanguage();
};

const initWith = async (lng: SupportedLanguage): Promise<void> => {
	await i18n.use(initReactI18next).init({
		resources,
		lng,
		fallbackLng: SOURCE_LANGUAGE,
		defaultNS: 'common',
		ns: ['common', 'response-message'],
		interpolation: { escapeValue: false },
	});
};

/**
 * Resolves once i18next is ready with the saved choice, else the phone
 * language. Never rejects: if detection or init fails, French is used so the
 * app still renders.
 */
export const initI18n = async (): Promise<void> => {
	if (i18n.isInitialized) {
		return;
	}
	try {
		await initWith(await readInitialLanguage());
	} catch (error) {
		console.warn('i18n init failed, falling back to French', error);
		await initWith(DEFAULT_LANGUAGE);
	}
};

/** Switches the UI language; resolves false when the choice could not be saved. */
export const changeAppLanguage = async (
	language: SupportedLanguage,
): Promise<boolean> => {
	await i18n.changeLanguage(language);
	try {
		await writeStoredLanguage(language);
		return true;
	} catch (error) {
		console.warn('Could not save the language choice', error);
		return false;
	}
};

export { i18n };

/** What a screen needs to show a message in the current language. */
export type MessageSpec = {
	key: string;
	values?: Record<string, string | number>;
};

/**
 * Keys picked at runtime (API errors) are plain strings, not the typed key
 * union, so they go through i18next's loose lookup; static keys stay typed.
 */
// A `defaultValue` selects i18next's string-key overload, so no cast is needed.
export const messageText = (spec: MessageSpec): string =>
	String(i18n.t(spec.key, { ...spec.values, defaultValue: spec.key }));
