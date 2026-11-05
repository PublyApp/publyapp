import type { i18n as I18nInstance } from 'i18next';
import { z } from 'zod';

import {
	FALLBACK_LANGUAGE,
	isSupportedLanguage,
	type SupportedLanguage,
} from '@org/shared-ts/lib/i18n/shared';

let activeClientI18n: I18nInstance | undefined;
let activeLocale: SupportedLanguage = FALLBACK_LANGUAGE;

const resolveLocale = (value: string | undefined): SupportedLanguage =>
	isSupportedLanguage(value) ? value : FALLBACK_LANGUAGE;

export const initI18nOnClient = async (
	instance: I18nInstance,
): Promise<I18nInstance> => {
	const htmlLocale =
		typeof document !== 'undefined' ? document.documentElement.lang : undefined;
	const locale = resolveLocale(
		isSupportedLanguage(htmlLocale) ? htmlLocale : instance.resolvedLanguage,
	);
	if (activeClientI18n === instance && activeLocale === locale) {
		return instance;
	}
	activeClientI18n = instance;
	activeLocale = locale;
	// zod v4 keeps one process-wide error map, so a language change re-installs
	// that locale's own messages.
	z.config(z.locales[locale]());
	return instance;
};
