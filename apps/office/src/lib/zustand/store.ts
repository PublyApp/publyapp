import { create } from 'zustand';

import dummySlice from './features/dummy.slice';
import fileManagerSlice from './features/fileManager.slice';
import { combinedMiddlewares } from './utils';

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
