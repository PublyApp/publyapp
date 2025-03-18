import i18next from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import Fetch from 'i18next-fetch-backend';
import { defaultApiClient } from 'packages/api/ApiClient';
import { initReactI18next } from 'react-i18next';
import { getInitialNamespaces } from 'remix-i18next/client';

import { LOCALE_HEADER_KEY } from '@/shared/lib/constants';
import { getCorrectLocale } from '@/shared/lib/i18n/i18n.utils';

import { env } from '../env';
import { defaultZodClient } from '../zod';

import { config } from './i18n.config';

const backendUrl = new URL(env.VITE_SERVER_URL);
backendUrl.pathname = '/resources/{{lng}}.{{ns}}.json';

export const initI18nOnClient = async () => {
	await i18next
		.use(initReactI18next) // Tell i18next to use the react-i18next plugin
		.use(LanguageDetector) // Setup a client-side language detector
		.use(Fetch) // Setup your backend
		.init({
			...config, // spread the configuration
			// This function detects the namespaces your routes rendered while SSR use
			ns: getInitialNamespaces(),
			backend: {
				loadPath: decodeURIComponent(backendUrl.toString()),
			},
			detection: {
				// Here only enable htmlTag detection, we'll detect the language only
				// server-side with remix-i18next, by using the `<html lang>` attribute
				// we can communicate to the client the language detected server-side
				order: ['htmlTag'],
				// Because we only use htmlTag, there's no reason to cache the language
				// on the browser, so we disable it
				caches: [],
			},
		});

	i18next.on('languageChanged', (language) => {
		defaultApiClient.parseRestClient.setHeader(LOCALE_HEADER_KEY, language);

		// TODO: set locale for other libraries
		// // set locale of dayjs (date formatting)
		// // se locale of numeral.js (number formatting)
		// numeral.locale(value);

		// set locale for our InterZod instance
		defaultZodClient.setLocale(getCorrectLocale(language));
	});

	return i18next;
};
