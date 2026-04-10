import * as cookie from 'cookie';
import dayjs from 'dayjs';
import type { i18n as I18nInstance } from 'i18next';
import i18next from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import Fetch from 'i18next-fetch-backend';
import _ from 'lodash';
import { initReactI18next } from 'react-i18next';
import { getInitialNamespaces } from 'remix-i18next/client';

import {
	LANGUAGE_DETECTION_METHOD,
	LANGUAGE_DETECTION_METHOD_ENUM,
	LOCALE_COOKIE_KEY,
	queryParamKey,
} from '@org/shared-ts/lib/constants';
import { getCorrectLocale } from '@org/shared-ts/lib/i18n/i18n.utils';
import type { AppLocale } from '@org/shared-ts/lib/i18n/resources';
import { logger } from '@org/shared-ts/lib/logger/iso-logger';
import duration from '@org/shared-ts/utils/duration.utils';

import { interZodClient } from '../zod/zod.client';
import { config } from './i18n.config';
import { localeTabSync } from './locale-tab-sync.client';

const backendUrl = new URL(window.location.origin);
backendUrl.pathname = '/tx/{{ns}}.{{lng}}.json';

let INITIALIZED = false;

export const initI18nOnClient = async () => {
	if (INITIALIZED) {
		return i18next;
	}

	const initialNamespaces = getInitialNamespaces();

	await initI18nextInstance(initialNamespaces);

	INITIALIZED = true;

	initI18nHmr();
	initLocaleSideEffects(i18next);
	localeTabSync.initLocaleTabListener(i18next);

	return i18next;
};

const initI18nextInstance = async (initialNamespaces: string[]) => {
	await i18next
		.use(initReactI18next) // Tell i18next to use the react-i18next plugin
		.use(LanguageDetector) // Setup a client-side language detector
		.use(Fetch) // Setup your backend
		.init({
			...config, // spread the configuration
			// This function detects the namespaces your routes rendered while SSR use
			ns: initialNamespaces,
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
};

const initI18nHmr = () => {
	// HMR: reload translations when the copy plugin broadcasts updates
	if (!import.meta.hot) {
		return;
	}

	import.meta.hot.on('i18n:updated', async (data) => {
		try {
			logger.debug('[i18n-hmr] Reloading translations...', data);

			// Force reload all resources with cache busting
			const lng = i18next.language;
			const loadedNamespaces = _.keys(i18next.store.data[lng] || {});

			// Clear the cache first
			i18next.store.data = {};

			// Reload resources with cache busting
			await i18next.reloadResources(lng, loadedNamespaces);

			// Force a re-render by triggering a language change event
			i18next.emit('languageChanged', lng);

			logger.debug('[i18n-hmr] Translations reloaded successfully');
		} catch (err) {
			logger.error('[i18n-hmr] reload failed', err);
		}
	});
};

const applyDayjsLocale = (locale: AppLocale) => {
	// date formatting
	dayjs.locale(locale);
};

const applyInterZodLocale = (locale: AppLocale) => {
	interZodClient.setLocale(locale);
};

const persistLocalePreference = (locale: AppLocale) => {
	if (
		LANGUAGE_DETECTION_METHOD === LANGUAGE_DETECTION_METHOD_ENUM.QUERY_PARAM
	) {
		// set the locale search param in the url
		const url = new URL(window.location.href);
		url.searchParams.set(queryParamKey.language, locale);
		window.history.pushState({}, '', url);
		return;
	}

	// set the locale cookie
	const localeCookie = cookie.serialize(LOCALE_COOKIE_KEY, locale, {
		maxAge: duration.toSeconds('30d'), // 30 days
		path: '/',
	});
	document.cookie = localeCookie;
};

const initLocaleSideEffects = (i18n: I18nInstance) => {
	i18n.on('languageChanged', (language) => {
		const correctLocale = getCorrectLocale(language);
		applyDayjsLocale(correctLocale);
		applyInterZodLocale(correctLocale);
		persistLocalePreference(correctLocale);

		// Only broadcast if this tab initiated the change; remote tab changes should not echo back.
		if (localeTabSync.shouldBroadcast()) {
			localeTabSync.broadcastLocaleToTabs(correctLocale);
		}
	});
};
