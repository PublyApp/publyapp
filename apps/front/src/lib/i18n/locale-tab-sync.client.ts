import type { i18n as I18nInstance } from 'i18next';

import { getCorrectLocale } from '@org/shared-ts/lib/i18n/i18n.utils';
import type { AppLocale } from '@org/shared-ts/lib/i18n/resources';
import { logger } from '@org/shared-ts/lib/logger/iso-logger';
import { getErrorMessage } from '@org/shared-ts/utils/error.utils';

type LocaleTabSyncMessage = {
	v: 1;
	locale: AppLocale;
	senderId: string;
	ts: number;
};

export type LocaleTabSyncResult = {
	stop: () => void;
};

export class LocaleTabSync {
	// Cross-tab locale sync:
	// - Primary: BroadcastChannel (explicit and real-time in modern browsers)
	// - Fallback: localStorage + `storage` event (works broadly)
	// Note: cookie/query-param persistence does not notify other tabs, so it's not sufficient on its own.
	private static readonly _channelName = 'publyapp:i18n:locale';
	private static readonly _storageKey = 'publyapp:i18n:locale';

	private static _createSenderId(): string {
		try {
			if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
				return crypto.randomUUID();
			}
		} catch {
			// ignore
		}

		return `${Math.random().toString(16).slice(2)}-${Date.now().toString(16)}`;
	}

	private static _tryParseMessage(raw: string): LocaleTabSyncMessage | null {
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
	}

	private static _tryParseMessageFromUnknown(
		data: unknown,
	): LocaleTabSyncMessage | null {
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
	}

	private _started = false;
	private _applyingRemoteLocale = false;
	private readonly _senderId = LocaleTabSync._createSenderId();
	private _channel: BroadcastChannel | null | undefined = undefined;
	private _onStorageEvent: ((event: StorageEvent) => void) | null = null;
	private _onChannelMessage: ((event: MessageEvent) => void) | null = null;

	public shouldBroadcast(): boolean {
		return !this._applyingRemoteLocale;
	}

	private _getChannel() {
		if (this._channel !== undefined) {
			return this._channel;
		}

		try {
			if ('BroadcastChannel' in window) {
				this._channel = new BroadcastChannel(LocaleTabSync._channelName);
				return this._channel;
			}
		} catch (error) {
			logger.debug('[i18n-sync] BroadcastChannel init failed', { error });
		}

		this._channel = null;
		return this._channel;
	}

	// Broadcast the locale change to other tabs (best-effort, never throws).
	public broadcastLocaleToTabs(locale: AppLocale) {
		const message: LocaleTabSyncMessage = {
			v: 1,
			locale,
			senderId: this._senderId,
			ts: Date.now(),
		};

		// Best-effort only: failing to notify other tabs must not break the current tab.
		try {
			this._getChannel()?.postMessage(message);
		} catch (error) {
			logger.debug('[i18n-sync] BroadcastChannel post failed', { error });
		}

		try {
			window.localStorage.setItem(
				LocaleTabSync._storageKey,
				JSON.stringify(message),
			);
		} catch (error) {
			logger.debug('[i18n-sync] localStorage write failed', { error });
		}
	}

	// Listen for locale changes from other tabs and apply them to this tab's i18n instance.
	public initLocaleTabListener(i18n: I18nInstance): LocaleTabSyncResult {
		if (typeof window === 'undefined') {
			return { stop: () => {} };
		}

		// Register cross-tab listeners once per tab to avoid duplicate message handling.
		if (this._started) {
			return { stop: () => {} };
		}
		this._started = true;

		const channel = this._getChannel();

		const applyRemoteLocale = async (locale: AppLocale) => {
			if (locale === i18n.resolvedLanguage) {
				return;
			}

			// Mark this change as remote so `languageChanged` handlers can skip broadcasting it back out.
			this._applyingRemoteLocale = true;
			try {
				await i18n.changeLanguage(locale);
			} finally {
				this._applyingRemoteLocale = false;
			}
		};

		const onRemoteMessage = (message: LocaleTabSyncMessage) => {
			if (message.senderId === this._senderId) {
				return;
			}

			void applyRemoteLocale(message.locale).catch((error) => {
				logger.error('[i18n-sync] Failed to apply locale', {
					error: getErrorMessage(error),
				});
			});
		};

		const onChannelMessage = (event: MessageEvent) => {
			const parsed = LocaleTabSync._tryParseMessageFromUnknown(event.data);
			if (!parsed) {
				return;
			}
			onRemoteMessage(parsed);
		};

		const onStorageEvent = (event: StorageEvent) => {
			if (event.key !== LocaleTabSync._storageKey || !event.newValue) {
				return;
			}

			const parsed = LocaleTabSync._tryParseMessage(event.newValue);
			if (!parsed) {
				return;
			}
			onRemoteMessage(parsed);
		};

		this._onStorageEvent = onStorageEvent;
		this._onChannelMessage = onChannelMessage;

		window.addEventListener('storage', onStorageEvent);
		channel?.addEventListener('message', onChannelMessage);

		const stop = () => {
			if (this._onStorageEvent) {
				try {
					window.removeEventListener('storage', this._onStorageEvent);
				} catch {
					// ignore
				}
				this._onStorageEvent = null;
			}

			if (this._onChannelMessage) {
				try {
					channel?.removeEventListener('message', this._onChannelMessage);
				} catch {
					// ignore
				}
				this._onChannelMessage = null;
			}

			try {
				channel?.close();
			} catch {
				// ignore
			}

			this._channel = undefined;
			this._started = false;
		};

		if (import.meta.hot) {
			import.meta.hot.dispose(() => {
				stop();
			});
		}

		return { stop };
	}
}

export const localeTabSync = new LocaleTabSync();
