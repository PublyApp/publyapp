// Import here your languages
import en from './locales/en';
import fr from './locales/fr';

export const appLocales = ['en', 'fr'] as const;

export type AppLocale = (typeof appLocales)[number];

export const resources = {
	en,
	fr,
} as const;

export const NS = Object.keys(fr);
export const defaultNS = 'common';
export const defaultLocale = appLocales[0];
