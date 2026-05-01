import _ from 'lodash';

import dummySlice from './features/dummy.slice';
import settingsSlice from './features/settings.slice';
import tenantsSlice from './features/tenants.slice';

export const slicesMap = (() => {
	const slices = [dummySlice, settingsSlice, tenantsSlice] as const;

	return new Map<string, (typeof slices)[number]>(
		slices.map((slice) => {
			return [slice.name, slice];
		}),
	);
})();

export type RootState = typeof settingsSlice.sliceContent &
	typeof dummySlice.sliceContent &
	typeof tenantsSlice.sliceContent;

type StoreInitializerArgs = Parameters<typeof settingsSlice.initializer>;

export const getInitialStore = (...a: StoreInitializerArgs): RootState => {
	const store: Partial<RootState> = {};

	slicesMap.forEach((slice) => {
		_.assign(store, slice.initializer(...(a as [never, never, never])));
	});

	return store as RootState;
};
