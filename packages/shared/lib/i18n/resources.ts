// Import here your languages
import en from './locales/en';
import fr from './locales/fr';

export const appLocales = ['en', 'fr'] as const;

export type AppLocale = (typeof appLocales)[number];

export const resources = {
	en,
	fr,
} as const;

export const defaultLocale = appLocales[0];
export const NS = Object.keys(resources[defaultLocale]);
export const defaultNS: keyof (typeof resources)[typeof defaultLocale] = 'common';

export type DefaultNS = typeof defaultNS;
