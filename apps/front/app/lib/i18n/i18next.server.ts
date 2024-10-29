// import { resolve } from 'node:path';

import Backend from 'i18next-fs-backend';
import { RemixI18Next } from 'remix-i18next/server';

import { i18nRemixCommonConfig } from './i18nextCommonUtils'; // your i18n configuration file

export const remixI18NextServer = new RemixI18Next({
	detection: {
		supportedLanguages: i18nRemixCommonConfig.supportedLngs as never,
		fallbackLanguage: i18nRemixCommonConfig.fallbackLng,
	},
	// This is the configuration for i18next used
	// when translating messages server-side only
	i18next: {
		...i18nRemixCommonConfig,
		// backend: {
		// 	loadPath: resolve('./public/locales/{{lng}}/{{ns}}.json'),
		// },
	},
	// The i18next plugins you want RemixI18next to use for `i18n.getFixedT` inside loaders and actions.
	// E.g. The Backend plugin for loading translations from the file system
	// Tip: You could pass `resources` to the `i18next` configuration and avoid a backend here
	plugins: [Backend],
});
