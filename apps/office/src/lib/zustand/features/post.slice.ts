import Slice from '../utils/Slice';

export type DummySliceState = {
	bear: number;
};

export type DummySliceActions = {
	addBear: () => void;
	removeBear: () => void;
};

export type DummySliceContent = DummySliceState & DummySliceActions;

const defaultValues: DummySliceState = {
	bear: 0,
};

const sliceName = 'postSlice' as const;

const dummySlice = new Slice<DummySliceContent, typeof sliceName>({
	name: sliceName,
	defaultValues,
	initializer: (set) => {
		return {
			// dummySlice: {
			...defaultValues,
			addBear: () => {
				set((state) => {
					// eslint-disable-next-line no-param-reassign
					state.postSlice.bear += 1;
				});
			},
			removeBear: () => {
				set((state) => {
					// eslint-disable-next-line no-param-reassign
					state.postSlice.bear -= 1;
				});
				// },
			},
		};
	},
	persistedFields: [
		//
		// 'bear',
	],
});

export default dummySlice;
