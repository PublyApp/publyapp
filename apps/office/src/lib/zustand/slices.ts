import _ from 'lodash';

import dummySlice from './features/dummy.slice';
import fileManagerSlice from './features/fileManager.slice';
import postSlice from './features/post.slice';
import settingsSlice from './features/settings.slice';
import type Slice from './utils/Slice';

export const slicesMap = (() => {
	const slices = [dummySlice, fileManagerSlice, postSlice, settingsSlice];

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	return new Map<string, Slice<any, any>>(
		slices.map((slice) => {
			return [slice.name, slice];
		}),
	);
})();

export type RootState = typeof fileManagerSlice.sliceContent &
	typeof dummySlice.sliceContent &
	typeof postSlice.sliceContent &
	typeof settingsSlice.sliceContent;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const getInitialStore = (...a: any[]) => {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const store: Record<string, any> = {};

	slicesMap.forEach((slice) => {
		_.assign(store, slice.initializer(...(a as [never, never, never])));
	});

	return store;
};
