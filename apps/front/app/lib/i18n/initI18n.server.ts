import { createInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';
import type { EntryContext } from 'react-router';

import { resources, type AppLocale } from '@/shared/lib/i18n/resources';

import { config } from './i18n.config';
import { remixI18NextServer } from './i18n.server';

export const iniI18nOnServer = async ({
	locale,
	routerContext,
}: {
	locale: AppLocale;
	routerContext: EntryContext;
}) => {
	const instance = createInstance();
	const ns = remixI18NextServer.getRouteNamespaces(routerContext);

	await instance
		.use(initReactI18next) // Tell our instance to use react-i18next
		.init({
			...config, // spread the configuration
			lng: locale, // The locale we detected above
			ns, // The namespaces the routes about to render wants to use
			resources,
		});

	return instance;
};
