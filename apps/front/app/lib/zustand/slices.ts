import _ from 'lodash';

import dummySlice from './features/dummy.slice';
import settingsSlice from './features/settings.slice';
import type Slice from './utils/Slice';

export const slicesMap = (() => {
	const slices = [dummySlice, settingsSlice];

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	return new Map<string, Slice<any, any, any>>(
		slices.map((slice) => {
			return [slice.name, slice];
		}),
	);
})();

export type RootState = typeof settingsSlice.sliceContent &
	typeof dummySlice.sliceContent;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const getInitialStore = (...a: any[]) => {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const store: Record<string, any> = {};

	slicesMap.forEach((slice) => {
		_.assign(store, slice.initializer(...(a as [never, never, never])));
	});

	return store;
};
