import _ from 'lodash';

import dummySlice from './features/dummy.slice';
import settingsSlice from './features/settings.slice';
import type Slice from './utils/Slice';

export const slicesMap = (() => {
	const slices = [dummySlice, settingsSlice];

	return new Map<string, Slice<any, any, any>>(
		slices.map((slice) => {
			return [slice.name, slice];
		}),
	);
})();

export type RootState = typeof settingsSlice.sliceContent &
	typeof dummySlice.sliceContent;

export const getInitialStore = (...a: any[]) => {
	const store: Record<string, any> = {};

	slicesMap.forEach((slice) => {
		_.assign(store, slice.initializer(...(a as [never, never, never])));
	});

	return store;
};
