import { logger } from '@org/shared-ts/lib/logger/iso-logger';

import type { SettingsState } from '#app/components/settings/types.ts';

type SettingsTabSyncMessage = {
	v: 1;
	settings: SettingsState;
	senderId: string;
	ts: number;
};

export type { SettingsTabSyncMessage };

export type SettingsTabSyncResult = {
	stop: () => void;
};

export class SettingsTabSync {
	// Cross-tab settings sync (mirrored on LocaleTabSync):
	// - Primary: BroadcastChannel for instant in-process delivery on modern browsers.
	// - Fallback: localStorage signal key + `storage` event for compatibility.
	private static readonly _channelName = 'publyapp:app-settings';
	private static readonly _signalStorageKey = 'publyapp:app-settings:signal';

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

	private static _isSettingsState(value: unknown): value is SettingsState {
		// Loose runtime shape check — message validators reject if not an object.
		return value !== null && typeof value === 'object';
	}

	private static _tryParseMessageFromUnknown(
		data: unknown,
	): SettingsTabSyncMessage | null {
		if (!data || typeof data !== 'object') {
			return null;
		}

		if ((data as { v?: unknown }).v !== 1) {
			return null;
		}

		const settings = (data as { settings?: unknown }).settings;
		const senderId = (data as { senderId?: unknown }).senderId;
		const ts = (data as { ts?: unknown }).ts;

		if (!SettingsTabSync._isSettingsState(settings)) {
			return null;
		}

		if (typeof senderId !== 'string' || senderId.length === 0) {
			return null;
		}

		if (typeof ts !== 'number') {
			return null;
		}

		return {
			v: 1,
			settings: settings as SettingsState,
			senderId,
			ts,
		};
	}

	private static _tryParseMessage(raw: string): SettingsTabSyncMessage | null {
		try {
			const parsed: unknown = JSON.parse(raw);
			return SettingsTabSync._tryParseMessageFromUnknown(parsed);
		} catch {
			return null;
		}
	}

	private _started = false;
	private _applyingRemote = false;
	private _lastAppliedTs = 0;
	private readonly _senderId = SettingsTabSync._createSenderId();
	private _channel: BroadcastChannel | null | undefined = undefined;
	private _onStorageEvent: ((event: StorageEvent) => void) | null = null;
	private _onChannelMessage: ((event: MessageEvent) => void) | null = null;
	private _onVisibility: (() => void) | null = null;
	private _onPageshow: ((event: PageTransitionEvent) => void) | null = null;
	private _visibilityStarted = false;

	public shouldBroadcast(): boolean {
		return !this._applyingRemote;
	}

	private _getChannel() {
		if (this._channel !== undefined) {
			return this._channel;
		}

		if (typeof window === 'undefined') {
			this._channel = null;
			return this._channel;
		}

		try {
			if ('BroadcastChannel' in window) {
				this._channel = new BroadcastChannel(SettingsTabSync._channelName);
				return this._channel;
			}
		} catch (error) {
			logger.debug('[settings-sync] BroadcastChannel init failed', { error });
		}

		this._channel = null;
		return this._channel;
	}

	// Broadcast a settings change to other tabs (best-effort; never throws).
	public broadcastSettingsToTabs(settings: SettingsState) {
		if (typeof window === 'undefined') {
			return;
		}

		const message: SettingsTabSyncMessage = {
			v: 1,
			settings,
			senderId: this._senderId,
			ts: Date.now(),
		};

		try {
			this._getChannel()?.postMessage(message);
		} catch (error) {
			logger.debug('[settings-sync] BroadcastChannel post failed', { error });
		}

		try {
			window.localStorage.setItem(
				SettingsTabSync._signalStorageKey,
				JSON.stringify(message),
			);
		} catch (error) {
			logger.debug('[settings-sync] localStorage write failed', { error });
		}
	}

	// Apply callback receives the validated remote message; the bridge component
	// supplies an implementation that updates Zustand and calls MUI's setMode.
	public initSettingsTabListener(
		applyRemote: (message: SettingsTabSyncMessage) => void,
	): SettingsTabSyncResult {
		if (typeof window === 'undefined') {
			return { stop: () => {} };
		}

		if (this._started) {
			return { stop: () => {} };
		}
		this._started = true;

		const channel = this._getChannel();

		const onRemoteMessage = (message: SettingsTabSyncMessage) => {
			if (message.senderId === this._senderId) {
				return; // echo
			}

			if (message.ts <= this._lastAppliedTs) {
				return; // stale
			}

			this._applyingRemote = true;
			try {
				applyRemote(message);
				this._lastAppliedTs = message.ts;
			} finally {
				this._applyingRemote = false;
			}
		};

		const onChannelMessage = (event: MessageEvent) => {
			const parsed = SettingsTabSync._tryParseMessageFromUnknown(event.data);
			if (!parsed) {
				return;
			}
			onRemoteMessage(parsed);
		};

		const onStorageEvent = (event: StorageEvent) => {
			if (event.key !== SettingsTabSync._signalStorageKey || !event.newValue) {
				return;
			}

			const parsed = SettingsTabSync._tryParseMessage(event.newValue);
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

	// Synchronously reapplies the latest scheme on visibility/pageshow, eliminating
	// the cached-compositor-frame flash when a backgrounded tab regains focus.
	public initVisibilityRehydrate(
		applyRemote: (message: SettingsTabSyncMessage) => void,
	): SettingsTabSyncResult {
		if (typeof window === 'undefined') {
			return { stop: () => {} };
		}

		if (this._visibilityStarted) {
			return { stop: () => {} };
		}
		this._visibilityStarted = true;

		const rehydrate = () => {
			if (document.visibilityState !== 'visible') {
				return;
			}

			let raw: string | null;
			try {
				raw = window.localStorage.getItem(SettingsTabSync._signalStorageKey);
			} catch (error) {
				logger.debug('[settings-sync] localStorage read failed', { error });
				return;
			}

			if (!raw) {
				return;
			}

			const parsed = SettingsTabSync._tryParseMessage(raw);
			if (!parsed) {
				return;
			}

			if (parsed.senderId === this._senderId) {
				return; // self
			}

			if (parsed.ts <= this._lastAppliedTs) {
				return; // already applied
			}

			// Synchronous DOM mutation BEFORE any React render, so the next composited
			// frame uses the right CSS variables (data-color-scheme drives them).
			const colorScheme = parsed.settings.colorScheme;
			if (
				colorScheme &&
				document.documentElement.dataset.colorScheme !== colorScheme
			) {
				document.documentElement.dataset.colorScheme = colorScheme;
			}

			this._applyingRemote = true;
			try {
				applyRemote(parsed);
				this._lastAppliedTs = parsed.ts;
			} finally {
				this._applyingRemote = false;
			}
		};

		const onVisibility = () => {
			rehydrate();
		};
		const onPageshow = (_event: PageTransitionEvent) => {
			rehydrate();
		};

		this._onVisibility = onVisibility;
		this._onPageshow = onPageshow;

		document.addEventListener('visibilitychange', onVisibility);
		window.addEventListener('pageshow', onPageshow);

		const stop = () => {
			if (this._onVisibility) {
				try {
					document.removeEventListener('visibilitychange', this._onVisibility);
				} catch {
					// ignore
				}
				this._onVisibility = null;
			}
			if (this._onPageshow) {
				try {
					window.removeEventListener('pageshow', this._onPageshow);
				} catch {
					// ignore
				}
				this._onPageshow = null;
			}
			this._visibilityStarted = false;
		};

		if (import.meta.hot) {
			import.meta.hot.dispose(() => {
				stop();
			});
		}

		return { stop };
	}
}

export const settingsTabSync = new SettingsTabSync();
