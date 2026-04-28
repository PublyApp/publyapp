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

export const combinedMiddlewaresWithSettingsPersist = <T>(
	initializer: StateCreator<T, [['zustand/immer', never]], []>,
) => {
	return devtools(
		persist(immer<T>(initializer), {
			name: SETTINGS_STORAGE_KEY,
			version: 1,
			storage: createJSONStorage<T>(() => {
				return getSettingsLocalStorage();
			}) as never,
			// Persist only settingsSlice.state — leave actions, openDrawer, canReset, and other slices untouched.
			partialize: (state) => {
				const settingsSlice = (
					state as unknown as {
						settingsSlice?: { state?: unknown };
					}
				).settingsSlice;

				return {
					settingsSlice: {
						state: settingsSlice?.state,
					},
				} as unknown as Partial<T>;
			},
			merge: (persistedState, currentState) => {
				return merge({}, currentState, persistedState);
			},
			// migrate: (persisted, fromVersion) => persisted, // intentional no-op until shape changes
		}),
	);
};
