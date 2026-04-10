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
import { getErrorMessage } from '@org/shared-ts/utils/error.utils';

import { interZodClient } from '../zod/zod.client';
import { config } from './i18n.config';

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
	initLocaleTabListener(i18next);

	return i18next;
};

type LocaleTabSyncMessage = {
	v: 1;
	locale: AppLocale;
	senderId: string;
	ts: number;
};

// Cross-tab locale sync:
// - Primary: BroadcastChannel (explicit and real-time in modern browsers)
// - Fallback: localStorage + `storage` event (works broadly)
// Note: cookie/query-param persistence does not notify other tabs, so it's not sufficient on its own.
const LOCALE_TAB_SYNC_CHANNEL_NAME = 'publyapp:i18n:locale';
const LOCALE_TAB_SYNC_STORAGE_KEY = 'publyapp:i18n:locale';

const createLocaleTabSyncSenderId = (): string => {
	try {
		if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
			return crypto.randomUUID();
		}
	} catch {
		// ignore
	}

	return `${Math.random().toString(16).slice(2)}-${Date.now().toString(16)}`;
};

const tryParseLocaleTabSyncMessage = (
	raw: string,
): LocaleTabSyncMessage | null => {
	try {
		const parsed: unknown = JSON.parse(raw);
		if (
			!parsed ||
			typeof parsed !== 'object' ||
			(parsed as { v?: unknown }).v !== 1
		) {
			return null;
		}

		const localeRaw = (parsed as { locale?: unknown }).locale;
		const locale = getCorrectLocale(
			typeof localeRaw === 'string' ? localeRaw : undefined,
		);
		const senderId = (parsed as { senderId?: unknown }).senderId;
		const ts = (parsed as { ts?: unknown }).ts;

		if (typeof senderId !== 'string' || senderId.length === 0) {
			return null;
		}

		if (typeof ts !== 'number') {
			return null;
		}

		return {
			v: 1,
			locale,
			senderId,
			ts,
		};
	} catch {
		return null;
	}
};

type LocaleTabSyncResult = {
	stop: () => void;
};

let LOCALE_TAB_SYNC_STARTED = false;
// Prevent ping-pong loops: remote-applied locale changes should not be broadcast again.
let APPLYING_REMOTE_LOCALE = false;
// Stable per-tab sender id so a tab can ignore its own messages.
let LOCALE_TAB_SYNC_SENDER_ID: string | null = null;
// Lazily created + cached BroadcastChannel (may be null if unsupported/blocked).
let LOCALE_TAB_SYNC_BROADCAST_CHANNEL: BroadcastChannel | null | undefined;

const getLocaleTabSyncSenderId = () => {
	if (LOCALE_TAB_SYNC_SENDER_ID) {
		return LOCALE_TAB_SYNC_SENDER_ID;
	}

	LOCALE_TAB_SYNC_SENDER_ID = createLocaleTabSyncSenderId();
	return LOCALE_TAB_SYNC_SENDER_ID;
};

const getLocaleTabSyncChannel = () => {
	if (LOCALE_TAB_SYNC_BROADCAST_CHANNEL !== undefined) {
		return LOCALE_TAB_SYNC_BROADCAST_CHANNEL;
	}

	try {
		if ('BroadcastChannel' in window) {
			LOCALE_TAB_SYNC_BROADCAST_CHANNEL = new BroadcastChannel(
				LOCALE_TAB_SYNC_CHANNEL_NAME,
			);
			return LOCALE_TAB_SYNC_BROADCAST_CHANNEL;
		}
	} catch (error) {
		logger.debug('[i18n-sync] BroadcastChannel init failed', { error });
	}

	LOCALE_TAB_SYNC_BROADCAST_CHANNEL = null;
	return LOCALE_TAB_SYNC_BROADCAST_CHANNEL;
};

const tryParseLocaleTabSyncMessageFromUnknown = (
	data: unknown,
): LocaleTabSyncMessage | null => {
	if (!data || typeof data !== 'object') {
		return null;
	}

	if ((data as { v?: unknown }).v !== 1) {
		return null;
	}

	const localeRaw = (data as { locale?: unknown }).locale;
	const locale = getCorrectLocale(
		typeof localeRaw === 'string' ? localeRaw : undefined,
	);
	const senderId = (data as { senderId?: unknown }).senderId;
	const ts = (data as { ts?: unknown }).ts;

	if (typeof senderId !== 'string' || senderId.length === 0) {
		return null;
	}

	if (typeof ts !== 'number') {
		return null;
	}

	return {
		v: 1,
		locale,
		senderId,
		ts,
	};
};

const broadcastLocaleToTabs = (locale: AppLocale) => {
	const senderId = getLocaleTabSyncSenderId();
	const message: LocaleTabSyncMessage = {
		v: 1,
		locale,
		senderId,
		ts: Date.now(),
	};

	// Best-effort only: failing to notify other tabs must not break the current tab.
	try {
		getLocaleTabSyncChannel()?.postMessage(message);
	} catch (error) {
		logger.debug('[i18n-sync] BroadcastChannel post failed', { error });
	}

	try {
		window.localStorage.setItem(
			LOCALE_TAB_SYNC_STORAGE_KEY,
			JSON.stringify(message),
		);
	} catch (error) {
		logger.debug('[i18n-sync] localStorage write failed', { error });
	}
};

const initLocaleTabListener = (i18n: I18nInstance): LocaleTabSyncResult => {
	if (typeof window === 'undefined') {
		return { stop: () => {} };
	}

	// Register cross-tab listeners once per tab to avoid duplicate message handling.
	if (LOCALE_TAB_SYNC_STARTED) {
		return { stop: () => {} };
	}
	LOCALE_TAB_SYNC_STARTED = true;

	const senderId = getLocaleTabSyncSenderId();
	const channel = getLocaleTabSyncChannel();

	const applyRemoteLocale = async (locale: AppLocale) => {
		if (locale === i18n.resolvedLanguage) {
			return;
		}

		// Mark this change as remote so `initLocaleSideEffects` can skip broadcasting it back out.
		APPLYING_REMOTE_LOCALE = true;
		try {
			await i18n.changeLanguage(locale);
		} finally {
			APPLYING_REMOTE_LOCALE = false;
		}
	};

	const onRemoteMessage = (message: LocaleTabSyncMessage) => {
		if (message.senderId === senderId) {
			return;
		}

		void applyRemoteLocale(message.locale).catch((error) => {
			logger.error('[i18n-sync] Failed to apply locale', {
				error: getErrorMessage(error),
			});
		});
	};

	const onChannelMessage = (event: MessageEvent) => {
		const parsed = tryParseLocaleTabSyncMessageFromUnknown(event.data);
		if (!parsed) {
			return;
		}
		onRemoteMessage(parsed);
	};

	const onStorageEvent = (event: StorageEvent) => {
		if (event.key !== LOCALE_TAB_SYNC_STORAGE_KEY || !event.newValue) {
			return;
		}

		const parsed = tryParseLocaleTabSyncMessage(event.newValue);
		if (!parsed) {
			return;
		}
		onRemoteMessage(parsed);
	};

	window.addEventListener('storage', onStorageEvent);
	channel?.addEventListener('message', onChannelMessage);

	const stop = () => {
		try {
			window.removeEventListener('storage', onStorageEvent);
		} catch {
			// ignore
		}

		try {
			channel?.removeEventListener('message', onChannelMessage);
			channel?.close();
		} catch {
			// ignore
		}

		LOCALE_TAB_SYNC_BROADCAST_CHANNEL = undefined;
	};

	if (import.meta.hot) {
		import.meta.hot.dispose(() => {
			stop();
			LOCALE_TAB_SYNC_STARTED = false;
		});
	}

	return { stop };
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
		if (!APPLYING_REMOTE_LOCALE) {
			broadcastLocaleToTabs(correctLocale);
		}
	});
};
