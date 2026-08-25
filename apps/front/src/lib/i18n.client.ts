import type { i18n as I18nInstance } from 'i18next';
import { z } from 'zod';

import InterZod from '@org/shared-ts/lib/zod/InterZod';

import {
	FALLBACK_LANGUAGE,
	isSupportedLanguage,
	type SupportedLanguage,
} from './i18n.shared';

type InterZodOptions = ConstructorParameters<typeof InterZod>[0];
type InterZodI18nLike = InterZodOptions['i18n'];

const bindInterZodToI18n = (
	instance: I18nInstance,
	locale: SupportedLanguage,
) => {
	const i18nLike: InterZodI18nLike = {
		getFixedT: instance.getFixedT.bind(instance),
		t: instance.t.bind(instance),
	};

	return new InterZod({
		i18n: i18nLike,
		locale,
	});
};

let activeClientI18n: I18nInstance | undefined;
let activeLocale: SupportedLanguage = FALLBACK_LANGUAGE;
let interZodClient: InterZod | undefined;

export const getInterZodClient = (): InterZod => {
	if (!interZodClient) {
		throw new Error('Client i18n has not been initialized');
	}
	return interZodClient;
};

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
	interZodClient = bindInterZodToI18n(instance, locale);
	z.setErrorMap(interZodClient.getErrorMap());
	return instance;
};
