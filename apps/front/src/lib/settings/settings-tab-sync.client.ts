import { logger } from '@org/shared-ts/lib/logger/iso-logger';

import {
	getPersistedSettingsStorageKey,
	getSettingsSnapshotFromPersistedValue,
	isIncomingSettingsSnapshotNewer,
	type SettingsSyncSnapshot,
} from './settings-sync-state.client.ts';

export type SettingsTabSyncResult = {
	stop: () => void;
};

type SettingsTabSyncOptions = {
	// The sync class does not import the store directly. The bridge supplies the
	// current snapshot so this class stays a browser-event adapter.
	getCurrentSnapshot: () => SettingsSyncSnapshot;
	// Applying a snapshot updates Zustand and MUI together; keeping it injected
	// avoids this low-level class depending on React hooks.
	applySnapshot: (snapshot: SettingsSyncSnapshot) => void;
};

export class SettingsTabSync {
	private _storageStarted = false;
	private _visibilityStarted = false;
	private _onStorageEvent: ((event: StorageEvent) => void) | null = null;
	private _onVisibility: (() => void) | null = null;
	private _onPageshow: ((event: PageTransitionEvent) => void) | null = null;

	private _applyIfNewer(
		snapshot: SettingsSyncSnapshot,
		options: SettingsTabSyncOptions,
	) {
		// Storage events can be delayed or duplicated. Apply only if the canonical
		// persisted snapshot wins against the live store snapshot.
		if (
			!isIncomingSettingsSnapshotNewer(snapshot, options.getCurrentSnapshot())
		) {
			return;
		}

		const colorScheme = snapshot.state.colorScheme;
		if (
			colorScheme &&
			document.documentElement.dataset.colorScheme !== colorScheme
		) {
			// Write the data attribute before scheduling React/MUI updates so the
			// resumed tab paints with the latest CSS variable selector.
			document.documentElement.dataset.colorScheme = colorScheme;
		}

		options.applySnapshot(snapshot);
	}

	private _readSnapshotFromStorage() {
		try {
			// Visibility/pageshow rehydrates from canonical persisted settings, not
			// from a transient signal key, so stale notification payloads cannot win.
			return getSettingsSnapshotFromPersistedValue(
				window.localStorage.getItem(getPersistedSettingsStorageKey()),
			);
		} catch (error) {
			logger.debug('[settings-sync] localStorage read failed', { error });
			return null;
		}
	}

	public initSettingsStorageListener(
		options: SettingsTabSyncOptions,
	): SettingsTabSyncResult {
		if (typeof window === 'undefined') {
			return { stop: () => {} };
		}

		if (this._storageStarted) {
			return { stop: () => {} };
		}
		this._storageStarted = true;

		const onStorageEvent = (event: StorageEvent) => {
			if (event.key !== getPersistedSettingsStorageKey()) {
				return;
			}

			// Other tabs notify us by changing the same persisted key that reloads
			// use. One key means one source of truth.
			const snapshot = getSettingsSnapshotFromPersistedValue(event.newValue);
			if (!snapshot) {
				return;
			}

			this._applyIfNewer(snapshot, options);
		};

		this._onStorageEvent = onStorageEvent;
		window.addEventListener('storage', onStorageEvent);

		const stop = () => {
			if (this._onStorageEvent) {
				try {
					window.removeEventListener('storage', this._onStorageEvent);
				} catch {
					// ignore
				}
				this._onStorageEvent = null;
			}
			this._storageStarted = false;
		};

		if (import.meta.hot) {
			import.meta.hot.dispose(() => {
				stop();
			});
		}

		return { stop };
	}

	public initVisibilityRehydrate(
		options: SettingsTabSyncOptions,
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

			// Focus and BFCache restores can miss or delay storage events. Reading
			// the canonical value on resume closes that gap.
			const snapshot = this._readSnapshotFromStorage();
			if (!snapshot) {
				return;
			}

			this._applyIfNewer(snapshot, options);
		};

		const onVisibility = () => {
			rehydrate();
		};
		const onPageshow = () => {
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
