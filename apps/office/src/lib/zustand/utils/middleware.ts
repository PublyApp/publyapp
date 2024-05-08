import _ from 'lodash';
import { type StateCreator } from 'zustand';
import { createJSONStorage, devtools, persist, type StateStorage } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';

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
				// eslint-disable-next-line @typescript-eslint/no-use-before-define
				window.history.pushState(null, null as never, `?${decodeURIComponent(searchParams.toString())}`);
			}

			// if (!isPopstateEvent) {
			// 	if (newValue !== oldValue) {
			// 		// eslint-disable-next-line @typescript-eslint/no-use-before-define
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

export const combinedMiddlewares = <T>(initializer: StateCreator<T, [['zustand/immer', never]], []>) => {
	return devtools(immer<T>(initializer), {
		name: 'store',
		storage: createJSONStorage<T>(() => {
			return getStorage();
		}) as never,
	});
};
