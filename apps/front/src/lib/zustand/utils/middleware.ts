import merge from 'lodash/merge';
import type { StateCreator } from 'zustand';
import {
	createJSONStorage,
	devtools,
	persist,
	type StateStorage,
} from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';

import { SETTINGS_STORAGE_KEY } from '#app/components/settings/settings-config.ts';
import { getSettingsSnapshotFromPersistedRoot } from '#app/lib/settings/settings-sync-state.client.ts';

// Zustand creates the store during SSR too. Returning a no-op storage keeps the
// middleware shape identical on server and browser without touching `window`.
const noopStorage: StateStorage = {
	getItem: () => null,
	setItem: () => undefined,
	removeItem: () => undefined,
};

const getSettingsLocalStorage = (): StateStorage => {
	if (typeof window === 'undefined') {
		return noopStorage;
	}
	return window.localStorage;
};

export const combinedMiddlewares = <T>(
	initializer: StateCreator<T, [['zustand/immer', never]], []>,
) => {
	return devtools(
		persist(immer<T>(initializer), {
			name: SETTINGS_STORAGE_KEY,
			version: 1,
			storage: createJSONStorage<T>(() => {
				return getSettingsLocalStorage();
			}) as never,
			// Persist only durable settings data. UI state and actions must be rebuilt
			// on every load so drawer state, callbacks, and unrelated slices cannot leak.
			partialize: (state) => {
				const settingsSlice = (
					state as unknown as {
						settingsSlice?: {
							state?: unknown;
							revision?: unknown;
							updatedAt?: unknown;
							syncId?: unknown;
						};
					}
				).settingsSlice;

				return {
					settingsSlice: {
						state: settingsSlice?.state,
						revision: settingsSlice?.revision,
						updatedAt: settingsSlice?.updatedAt,
						syncId: settingsSlice?.syncId,
					},
				} as unknown as Partial<T>;
			},
			merge: (persistedState, currentState) => {
				const snapshot = getSettingsSnapshotFromPersistedRoot(persistedState);
				if (!snapshot) {
					return currentState;
				}

				// Persisted data is browser-controlled input. Sanitize it before it
				// reaches the live store so malformed localStorage cannot poison MUI.
				return merge({}, currentState, {
					settingsSlice: {
						state: snapshot.state,
						revision: snapshot.revision,
						updatedAt: snapshot.updatedAt,
						syncId: snapshot.syncId,
					},
				});
			},
			// migrate: (persisted, fromVersion) => persisted, // intentional no-op until shape changes
		}),
	);
};
