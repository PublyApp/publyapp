import _ from 'lodash';

import dummySlice from './features/dummy.slice';
import fileManagerSlice from './features/fileManager.slice';
import postSlice from './features/post.slice';
import type Slice from './utils/Slice';

export const slicesMap = (() => {
	const slices = [dummySlice, fileManagerSlice, postSlice];

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	return new Map<string, Slice<any, any>>(
		slices.map((slice) => {
			return [slice.name, slice];
		}),
	);
})();

export type RootState = typeof fileManagerSlice.sliceContent & typeof dummySlice.sliceContent;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const getInitialStore = (...a: any[]) => {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const store: Record<string, any> = {};

	slicesMap.forEach((slice) => {
		_.assign(store, slice.initializer(...(a as [never, never, never])));
	});

	return store;
};

// type DefaultRootValues = typeof fileManagerSlice.defaultValues & typeof dummySlice.defaultValues;

// export const getDefaultRootValues = () => {
// 	const values: DefaultRootValues = {} as never;

// 	slicesMap.forEach((slice) => {
// 		_.assign(values, slice.defaultValues);
// 	});

// 	return values;
// };

// export const defaultRootValues = getDefaultRootValues();

// export const getPersistedFields = () => {
// 	const fields: string[] = [];

// 	slicesMap.forEach((slice) => {
// 		fields.push(...slice.persistedFields);
// 	});

// 	return fields;
// };

// export const persistedFields = getPersistedFields();
