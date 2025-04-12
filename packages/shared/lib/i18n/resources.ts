// ! WARNING!: never import this file on any client-side/browser code
// ! because it will be costly in term of loading time/size/performance
// ! you should only import types from this files on client-side/browser code

// Import here your languages
import en from "./locales/en";
import fr from "./locales/fr";

export const appLocales = ["en", "fr"] as const;

export const resources = {
	en,
	fr,
} as const;

// eslint-disable-next-line @typescript-eslint/naming-convention
const _ns = ["common", "zod"] as const satisfies NameSpace[];
export const NS = _ns;

export const defaultLocale = appLocales[0];
export const defaultNS: keyof (typeof resources)[typeof defaultLocale] =
	"common";

export type AppLocale = (typeof appLocales)[number];
export type NameSpace = keyof (typeof resources)[AppLocale];
export type Namespaces = typeof _ns;
export type DefaultNS = typeof defaultNS;
export type DefaultLocale = typeof defaultLocale;
export type SupportedLanguages = typeof appLocales;
