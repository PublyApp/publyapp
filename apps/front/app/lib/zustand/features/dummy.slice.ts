import Slice from '../utils/Slice';

export type DummySliceValues = {
	bear: number;
};

export type DummySliceActions = {
	addBear: () => void;
	removeBear: () => void;
};

export type DummySliceState = DummySliceValues & DummySliceActions;

const defaultValues: DummySliceValues = {
	bear: 0,
};

const sliceName = 'dummySlice' as const;

const dummySlice = new Slice<
	typeof sliceName,
	DummySliceValues,
	DummySliceActions
>({
	name: sliceName,
	defaultValues,
	initializer: (set) => {
		return {
			...defaultValues,
			addBear: () => {
				set((state) => {
					// eslint-disable-next-line no-param-reassign
					state.dummySlice.bear += 1;
				});
			},
			removeBear: () => {
				set((state) => {
					// eslint-disable-next-line no-param-reassign
					state.dummySlice.bear -= 1;
				});
				// },
			},
		};
	},
});

export default dummySlice;
