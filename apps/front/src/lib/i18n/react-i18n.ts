import {
	createInstance,
	type i18n as I18nInstance,
	type Resource,
} from 'i18next';
import { initReactI18next } from 'react-i18next';

import type { SupportedNamespace } from '@org/shared-ts/lib/i18n/namespaces';
import {
	SUPPORTED_LANGUAGES,
	type I18nResources,
	type SupportedLanguage,
} from '@org/shared-ts/lib/i18n/shared';

/**
 * Builds an i18next instance from an already-loaded resource snapshot.
 *
 * This is the only piece of the shared i18n core that stays in `apps/front`: it registers
 * `react-i18next`'s plugin (`initReactI18next`), and `packages/shared-ts` must not gain a React
 * dependency for it. Everything it takes — the language set, the resource types, the namespace
 * registry — comes from `@org/shared-ts/lib/i18n/{shared,namespaces}`.
 */
export const createI18nFromResources = (
	locale: SupportedLanguage,
	namespaces: readonly SupportedNamespace[],
	resources: I18nResources,
): I18nInstance => {
	const instance = createInstance();
	void instance.use(initReactI18next).init({
		lng: locale,
		fallbackLng: false,
		supportedLngs: [...SUPPORTED_LANGUAGES],
		defaultNS: 'common',
		ns: [...namespaces],
		resources: resources as Resource,
		interpolation: { escapeValue: false },
		react: { useSuspense: false },
		initAsync: false,
	});
	return instance;
};
