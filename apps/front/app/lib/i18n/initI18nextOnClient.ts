import i18next from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';
import { getInitialNamespaces } from 'remix-i18next/client';

import { i18nRemixCommonConfig } from './i18nextCommonUtils';

export const initI18nextOnClient = () => {
	i18next
		.use(LanguageDetector) // Setup a client-side language detector
		.use(initReactI18next) // Tell i18next to use the react-i18next plugin
		// .use(Backend) // Setup your backend
		.init({
			...i18nRemixCommonConfig, // spread the configuration
			// This function detects the namespaces your routes rendered while SSR use
			ns: getInitialNamespaces(),
			// backend: { loadPath: '/locales/{{lng}}/{{ns}}.json' }, // ! I don't need http-backend for now
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
};
