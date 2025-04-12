import _ from 'lodash';

import dummySlice from './features/dummy.slice';
import settingsSlice from './features/settings.slice';
import type Slice from './utils/Slice';

export const slicesMap = (() => {
	const slices = [dummySlice, settingsSlice];

	// biome-ignore lint/suspicious/noExplicitAny: safe to use any here
	return new Map<string, Slice<any, any, any>>(
		slices.map((slice) => {
			return [slice.name, slice];
		}),
	);
})();

export type RootState = typeof settingsSlice.sliceContent &
	typeof dummySlice.sliceContent;

// biome-ignore lint/suspicious/noExplicitAny: safe to use any here
export const getInitialStore = (...a: any[]) => {
	// biome-ignore lint/suspicious/noExplicitAny: safe to use any here
	const store: Record<string, any> = {};

	// biome-ignore lint/complexity/noForEach: forEach is fine here
	slicesMap.forEach((slice) => {
		_.assign(store, slice.initializer(...(a as [never, never, never])));
	});

	return store;
};
