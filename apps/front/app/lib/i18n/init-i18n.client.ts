import * as cookie from 'cookie';
import dayjs from 'dayjs';
import i18next from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import Fetch from 'i18next-fetch-backend';
import { initReactI18next } from 'react-i18next';
import { getInitialNamespaces } from 'remix-i18next/client';
import {
	LANGUAGE_DETECTION_METHOD,
	LANGUAGE_DETECTION_METHOD_ENUM,
	LOCALE_COOKIE_KEY,
	queryParamKey,
} from '@/shared/lib/constants';
import { getCorrectLocale } from '@/shared/lib/i18n/i18n.utils';
import { clientLogger } from '@/shared/lib/logger/logger.client';
import duration from '@/shared/utils/duration.utils';
import { defaultZodClient } from '../zod/zod.client';
import { config } from './i18n.config';

const backendUrl = new URL(window.location.origin);
backendUrl.pathname = '/tx/{{ns}}.{{lng}}.json';

let INITIALIZED = false;

export const initI18nOnClient = async () => {
	if (INITIALIZED) {
		return i18next;
	}
	await i18next
		.use(initReactI18next) // Tell i18next to use the react-i18next plugin
		.use(LanguageDetector) // Setup a client-side language detector
		.use(Fetch) // Setup your backend
		.init({
			...config, // spread the configuration
			// This function detects the namespaces your routes rendered while SSR use
			ns: [...getInitialNamespaces()],
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

	INITIALIZED = true;

	// HMR: reload translations when the copy plugin broadcasts updates
	if (import.meta.hot) {
		import.meta.hot.on('i18n:updated', async (data) => {
			try {
				clientLogger.debug('[i18n-hmr] Reloading translations...', data);

				// Force reload all resources with cache busting
				const lng = i18next.language;
				const loadedNamespaces = Object.keys(i18next.store.data[lng] || {});

				// Clear the cache first
				i18next.store.data = {};

				// Reload resources with cache busting
				await i18next.reloadResources(lng, loadedNamespaces);

				// Force a re-render by triggering a language change event
				i18next.emit('languageChanged', lng);

				clientLogger.debug('[i18n-hmr] Translations reloaded successfully');
			} catch (err) {
				clientLogger.error('[i18n-hmr] reload failed', err);
			}
		});
	}

	i18next.on('languageChanged', (language) => {
		const correctLocale = getCorrectLocale(language);

		// set locale of dayjs (date formatting)
		dayjs.locale(correctLocale);
		// set locale for our InterZod instance
		defaultZodClient.setLocale(correctLocale);

		// TODO: set locale for other libraries
		// ???

		if (
			LANGUAGE_DETECTION_METHOD === LANGUAGE_DETECTION_METHOD_ENUM.QUERY_PARAM
		) {
			// set the locale search param in the url
			const url = new URL(window.location.href);
			url.searchParams.set(queryParamKey.language, correctLocale);
			window.history.pushState({}, '', url);
		} else {
			// set the locale cookie
			const localeCookie = cookie.serialize(LOCALE_COOKIE_KEY, correctLocale, {
				maxAge: duration.toSeconds('30d'), // 30 days
				path: '/',
			});
			document.cookie = localeCookie;
		}
	});

	return i18next;
};
