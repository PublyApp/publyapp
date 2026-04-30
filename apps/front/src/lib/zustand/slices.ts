import _ from 'lodash';

import dummySlice from './features/dummy.slice';
import settingsSlice from './features/settings.slice';
import tenantsSlice from './features/tenants.slice';
import type Slice from './utils/Slice';

export const slicesMap = (() => {
	const slices = [dummySlice, settingsSlice, tenantsSlice];

	// oxlint-disable-next-line typescript/no-explicit-any -- safe to use any here
	return new Map<string, Slice<any, any, any>>(
		slices.map((slice) => {
			return [slice.name, slice];
		}),
	);
})();

export type RootState = typeof settingsSlice.sliceContent &
	typeof dummySlice.sliceContent &
	typeof tenantsSlice.sliceContent;

// oxlint-disable-next-line typescript/no-explicit-any -- safe to use any here
export const getInitialStore = (...a: any[]) => {
	// oxlint-disable-next-line typescript/no-explicit-any -- safe to use any here
	const store: Record<string, any> = {};

	slicesMap.forEach((slice) => {
		_.assign(store, slice.initializer(...(a as [never, never, never])));
	});

	return store;
};
