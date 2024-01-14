import type { Dispatch, SetStateAction } from 'react';

import _ from 'lodash';
import type { UseFormReturn } from 'react-hook-form';

import type { ParsePost } from '@devist/shared/lib/parse/classes/post.class';

import type { RootState } from '../slices';
import Slice from '../utils/Slice';

export type PostSliceValues = {
	// bear: number;
	currentlyEditedPost: ParsePost | undefined;

	hookForm: UseFormReturn | undefined;
};

export type PostSliceActions = {
	// addBear: () => void;
	// removeBear: () => void;
	setCurrentlyEditedPost: Dispatch<SetStateAction<PostSliceValues['currentlyEditedPost']>>;
	setHookForm: Dispatch<SetStateAction<PostSliceValues['hookForm']>>;

	// savePostHandler: (...args: any[]) => any;
	// setSavePostHandler: (fn: (...args: any[]) => any) => void;
};

export type PostSliceState = PostSliceValues & PostSliceActions;

const defaultValues: PostSliceValues = {
	// bear: 0,
	currentlyEditedPost: undefined,
	hookForm: undefined,
};

const sliceName = 'postSlice' as const;

const PostSlice = new Slice<PostSliceState, typeof sliceName>({
	name: sliceName,
	defaultValues,
	initializer: (set) => {
		return {
			// PostSlice: {
			...defaultValues,
			setCurrentlyEditedPost: (value) => {
				set((state) => {
					let newValue: PostSliceValues['currentlyEditedPost'];

					if (_.isFunction(value)) {
						newValue = value(state.postSlice.currentlyEditedPost);
					} else {
						newValue = value;
					}

					// eslint-disable-next-line no-param-reassign
					state.postSlice.currentlyEditedPost = newValue;
				});
				// 	set()
				// }
			},
			setHookForm: (value) => {
				set((state) => {
					let newValue: PostSliceValues['hookForm'];

					if (_.isFunction(value)) {
						newValue = value(state.postSlice.hookForm as never);
					} else {
						newValue = value;
					}

					// eslint-disable-next-line no-param-reassign
					state.postSlice.hookForm = newValue as never;
				});
				// 	set()
				// }
			},
			// savePostHandler: () => {
			// 	console.log('-- default savePostHandler ---');
			// },
			// setSavePostHandler: (fn) => {
			// 	set((state) => {
			// 		// eslint-disable-next-line no-param-reassign
			// 		state.postSlice.savePostHandler = fn;
			// 	});
			// },
			// addBear: () => {
			// 	set((state) => {
			// 		// eslint-disable-next-line no-param-reassign
			// 		state.postSlice.bear += 1;
			// 	});
			// },
			// removeBear: () => {
			// 	set((state) => {
			// 		// eslint-disable-next-line no-param-reassign
			// 		state.postSlice.bear -= 1;
			// 	});
			// 	// },
			// },
		};
	},
	// persistedFields: [
	// 	//
	// 	// 'bear',
	// ],
});

export default PostSlice;

// ---- selectors ------------------------------------------------------------------------
export const selectCurrentlyEditedPost = (s: RootState) => {
	return s.postSlice.currentlyEditedPost;
};

export const selectHookForm = (s: RootState) => {
	return s.postSlice.hookForm;
};

export const setHookForm = (s: RootState) => {
	return s.postSlice.setHookForm;
};

// export const selectSetSavePostHandler = (s: RootState) => {
// 	return s.postSlice.setSavePostHandler;
// };

// export const selectSavePostHandler = (s: RootState) => {
// 	return s.postSlice.savePostHandler;
// };
