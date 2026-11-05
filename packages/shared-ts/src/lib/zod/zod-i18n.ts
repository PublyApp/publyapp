import { z } from 'zod';

import { isServer } from '../constants';
import { FALLBACK_LANGUAGE, type SupportedLanguage } from '../i18n/shared';

/** Options handed to a translator: fallback sentence plus placeholder values. */
export type TranslateOptions = {
	ns?: string;
	defaultValue?: string;
	[key: string]: string | undefined;
};

/**
 * Structural stand-in for i18next's branded `TFunction`: validators only call
 * `t(key, options)` and read plain strings back, so hand-rolled server-side
 * translators do not need i18next's internal `$TFunctionBrand` marker.
 */
export type ZodTranslator = (key: string, options?: TranslateOptions) => string;

type I18nLike = {
	getFixedT: (locale: SupportedLanguage) => ZodTranslator;
	t?: ZodTranslator;
};

/**
 * The zod namespace plus the translator/locale every shared validator factory
 * receives. Zod's own validation sentences come straight from
 * `z.locales[locale]`; `t` and `locale` only serve the app-level messages a
 * schema attaches itself (e.g. `invalid-item`, password rules).
 */
export type ZodI18n = typeof z & {
	t: ZodTranslator;
	locale: SupportedLanguage;
};

/**
 * Build the validator-facing zod facade for one i18n instance and install that
 * language's zod locale. Client callers pass the live instance (`t` follows the
 * active language); server callers get `getFixedT`, as they always did.
 */
export const createZodI18n = ({
	i18n,
	locale,
}: {
	i18n: I18nLike;
	locale?: SupportedLanguage;
}): ZodI18n => {
	const resolved = locale ?? FALLBACK_LANGUAGE;
	const t = isServer
		? i18n.getFixedT(resolved)
		: (i18n.t ?? i18n.getFixedT(resolved));

	// zod 4 keeps one process-wide error map, so installing a language is a
	// global `z.config` call.
	z.config(z.locales[resolved]());

	return { ...z, t, locale: resolved };
};
