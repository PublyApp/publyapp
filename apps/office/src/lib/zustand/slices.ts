import _ from 'lodash';

import dummySlice from './features/dummy.slice';
import fileManagerSlice from './features/fileManager.slice';
import type Slice from './utils/Slice';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const slicesMap = new Map<string, Slice<any, any>>([
	[fileManagerSlice.name, fileManagerSlice],
	[dummySlice.name, dummySlice],
]);

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

type DefaultRootValues = typeof fileManagerSlice.defaultValues & typeof dummySlice.defaultValues;

export const getDefaultRootValues = () => {
	const values: DefaultRootValues = {} as never;

	slicesMap.forEach((slice) => {
		_.assign(values, slice.defaultValues);
	});

	return values;
};

export const defaultRootValues = getDefaultRootValues();

export const getPersistedFields = () => {
	const fields: string[] = [];

	slicesMap.forEach((slice) => {
		fields.push(...slice.persistedFields);
	});

	return fields;
};

export const persistedFields = getPersistedFields();
