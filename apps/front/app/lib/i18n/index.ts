import { createInstance } from 'i18next';
import type { EntryContext } from 'react-router';

import { type AppLocale } from '@/shared/lib/i18n/resources';

import { remixI18NextServer } from './server';

const onServer = async ({ locale, remixContext }: { locale: AppLocale; remixContext: EntryContext }) => {
	const instance = createInstance();
	const ns = remixI18NextServer.getRouteNamespaces(remixContext);
};

export const initI18next = {
	onServer,
};
