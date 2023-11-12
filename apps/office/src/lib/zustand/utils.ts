import _ from 'lodash';
import { type StateCreator } from 'zustand';
import { createJSONStorage, devtools, persist, type StateStorage } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';

const getUrlSearch = () => {
	return window.location.search.slice(1);
};

const getStorage = (/* selectedFields: string[] */): StateStorage => {
	// // eslint-disable-next-line @typescript-eslint/naming-convention, no-underscore-dangle
	// const _selectedFields = selectedFields.map((e) => {
	// 	return `state.${e}`;
	// });
	// _selectedFields.push('version');

	return {
		// getItem: (key): string => {
		// 	const searchParams = new URLSearchParams(getUrlSearch());
		// 	const storedValue = searchParams.get(key);
		// 	const storedJson = JSON.parse(storedValue || '');
		// 	const selectedOnly = _.isEmpty(_selectedFields) ? storedJson : _.pick(storedJson, _selectedFields);
		// 	return JSON.stringify(selectedOnly);
		// },
		// setItem: (key, newValue): void => {
		// 	const searchParams = new URLSearchParams(getUrlSearch());
		// 	const newValueJson = JSON.parse(newValue);
		// 	const selectedOnly = _.isEmpty(_selectedFields) ? newValueJson : _.pick(newValueJson, _selectedFields);
		// 	searchParams.set(key, JSON.stringify(selectedOnly));
		// 	window.history.pushState(null, null as never, `?${decodeURIComponent(searchParams.toString())}`);
		// 	// window.history.pushState(null, null as any, `?${searchParams}`);
		// },
		// !===================
		getItem: (key): string | null => {
			const searchParams = new URLSearchParams(getUrlSearch());
			const storedValue = searchParams.get(key);
			return storedValue;
		},
		setItem: (key, newValue): void => {
			const searchParams = new URLSearchParams(getUrlSearch());
			searchParams.set(key, newValue);
			window.history.pushState(null, null as never, `?${decodeURIComponent(searchParams.toString())}`);
			// window.history.pushState(null, null as any, `?${searchParams}`);
		},
		removeItem: (key): void => {
			const searchParams = new URLSearchParams(getUrlSearch());
			searchParams.delete(key);
			window.location.search = searchParams.toString();
		},
	};
};

export const combinedMiddlewares = <T>(
	initializer: StateCreator<T, [['zustand/immer', never]], []>,
	selectedFields: string[],
) => {
	return devtools(
		persist(immer<T>(initializer), {
			name: 'store',
			storage: createJSONStorage<T>(() => {
				return getStorage(/* selectedFields */);
			}) as never,
			merge: (persistedState, currentState) => {
				return _.merge(persistedState, currentState);
			},
			partialize: (state) => {
				return _.pick(state, selectedFields);
			},
		}),
	);
};
