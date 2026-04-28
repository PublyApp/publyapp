import _ from 'lodash';
import type { StateCreator } from 'zustand';
import {
	createJSONStorage,
	devtools,
	persist,
	type StateStorage,
} from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';

import { SETTINGS_STORAGE_KEY } from '#app/components/settings/settings-config.ts';

import { getUrlSearch } from './utils';

const getStorage = (): StateStorage => {
	return {
		getItem: (key): string | null => {
			const searchParams = new URLSearchParams(getUrlSearch());
			const storedValue = searchParams.get(key);
			return storedValue;
		},
		setItem: (key, newValue): void => {
			const searchParams = new URLSearchParams(getUrlSearch());
			// const isPopstateEvent = window.isPopstateEventZustand && window.isPopstateEventZustand === true;
			const oldValue = searchParams.get(key);

			searchParams.set(key, newValue);

			if (newValue !== oldValue) {
				window.history.pushState(
					null,
					null as never,
					`?${decodeURIComponent(searchParams.toString())}`,
				);
			}

			// if (!isPopstateEvent) {
			// 	if (newValue !== oldValue) {
			//
			// 		window.history.pushState(null, null as never, `?${decodeURIComponent(searchParams.toString())}`);
			// 	}
			// } else {
			// 	// window.isPopstateEventZustand = false;
			// }
		},
		removeItem: (key): void => {
			const searchParams = new URLSearchParams(getUrlSearch());
			searchParams.delete(key);
			window.location.search = searchParams.toString();
		},
	};
};

export const combinedMiddlewaresWithPersist = <T>(
	initializer: StateCreator<T, [['zustand/immer', never]], []>,
	selectedFields: string[],
) => {
	return devtools(
		persist(immer<T>(initializer), {
			name: 'store',
			storage: createJSONStorage<T>(() => {
				return getStorage();
			}) as never,
			merge: (persistedState, currentState) => {
				return _.merge({}, currentState, persistedState);
			},
			partialize: (state) => {
				const p = _.pick(state, [...selectedFields]);
				return p;
			},
		}),
	);
};

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
				return _.merge({}, currentState, persistedState);
			},
			// migrate: (persisted, fromVersion) => persisted, // intentional no-op until shape changes
		}),
	);
};

export const combinedMiddlewares = <T>(
	initializer: StateCreator<T, [['zustand/immer', never]], []>,
) => {
	return devtools(immer<T>(initializer), {
		name: 'store',
		storage: createJSONStorage<T>(() => {
			return getStorage();
		}) as never,
	});
};
