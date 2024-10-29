import type { EntryContext } from '@remix-run/node';
import { createInstance } from 'i18next';
import Backend from 'i18next-fs-backend';
import { initReactI18next } from 'react-i18next';

import type { AppLocale } from '@/shared/lib/i18n/resources';

import { i18nRemixCommonConfig } from './i18n';
import { remixI18NextServer } from './i18next.server';

export const initI18nextOnServer = async ({
	// lang,
	// request,
	locale,
	remixContext,
}: {
	// lang?: string;
	// request: Request;
	locale: AppLocale;
	remixContext: EntryContext;
}) => {
	const instance = createInstance();
	const ns = remixI18NextServer.getRouteNamespaces(remixContext);

	await instance
		.use(initReactI18next) // Tell our instance to use react-i18next
		.use(Backend) // Setup our backend
		.init({
			...i18nRemixCommonConfig, // spread the configuration
			lng: locale, // The locale we detected above
			ns, // The namespaces the routes about to render wants to use
			// backend: { loadPath: path.resolve('./public/locales/{{lng}}/{{ns}}.json') }, // ! i use Ts files so I don't need this
		});

	return instance;
};
