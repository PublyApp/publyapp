import _ from 'lodash';
import { create } from 'zustand';

import dummySlice from './features/dummy.slice';
import fileManagerSlice from './features/fileManager.slice';
import { combinedMiddlewares, getUrlSearch } from './utils';

export type RootState = typeof fileManagerSlice.sliceContent & typeof dummySlice.sliceContent;

export const useMainStore = create<RootState>()(
	combinedMiddlewares(
		(...a) => {
			return {
				...fileManagerSlice.initializer(...a),
				...dummySlice.initializer(...a),
			};
		},
		[...fileManagerSlice.persistedFields, ...dummySlice.persistedFields],
	),
);

export const syncPopstateEvent = () => {
	window.addEventListener('popstate', () => {
		const searchParams = new URLSearchParams(getUrlSearch());
		// console.log(decodeURIComponent(searchParams.toString()));
		// console.log('######');
		const str = decodeURIComponent(searchParams.get('store') || '{}');
		const val = JSON.parse(str);
		_.assign(val, { state: { isPopstateEvent: true } });
		// console.log('URLval', JSON.stringify(val.state));
		// const currState = useMainStore.getState();
		// console.log('currState', JSON.stringify(currState));
		// const merged = _.merge(val.state, currState);
		// console.log('merged', JSON.stringify(merged));
		useMainStore.setState((state) => {
			// eslint-disable-next-line no-param-reassign, @typescript-eslint/no-unused-vars
			state = _.merge(state, val.state);
		});
	});
};
