import { resolve } from 'node:path';

import Backend from 'i18next-fs-backend';
import { RemixI18Next } from 'remix-i18next/server';

import { config } from './i18n.config';

export const remixI18NextServer = new RemixI18Next({
	detection: {
		supportedLanguages: config.supportedLngs as never,
		fallbackLanguage: config.fallbackLng,
	},
	// This is the configuration for i18next used
	// when translating messages server-side only
	i18next: {
		...config,
		backend: {
			// loadPath: import.meta.env.DEV
			// 	? resolve(process.cwd(), '../server/dist/resources/{{ns}}.{{lng}}.json')
			// 	: resolve(process.cwd(), './dist/resources/{{ns}}.{{lng}}.json'),
			loadPath: import.meta.env.DEV
				? resolve(process.cwd(), './public/tx/{{ns}}.{{lng}}.json')
				: resolve(process.cwd(), './build/client/tx/{{ns}}.{{lng}}.json'),
		},
	},
	// The i18next plugins you want RemixI18next to use for `i18n.getFixedT` inside loaders and actions.
	// E.g. The Backend plugin for loading translations from the file system
	// Tip: You could pass `resources` to the `i18next` configuration and avoid a backend here
	plugins: [Backend],
});
