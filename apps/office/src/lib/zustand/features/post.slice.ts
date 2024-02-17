import type { Dispatch, SetStateAction } from 'react';

import _ from 'lodash';

// import type { UseFormReturn } from 'react-hook-form';

import type { ParsePost } from '@devist/shared/lib/parse/classes/post.class';

import type { TranslatedIPostWithRelations } from '@/shared/types/db/post.types';

import type { RootState } from '../slices';
import Slice from '../utils/Slice';

export type PostSliceValues = {
	// edit post page
	currentlyEditedPost: ParsePost | undefined;

	// posts list (table)
	posts: TranslatedIPostWithRelations[];
	selectedPosts: TranslatedIPostWithRelations[];
};

export type PostSliceActions = {
	setCurrentlyEditedPost: Dispatch<SetStateAction<PostSliceValues['currentlyEditedPost']>>;

	setPosts: Dispatch<SetStateAction<PostSliceValues['posts']>>;
	// addPost: VoidFunction;
	// removePost: VoidFunction;
	// updatePost: VoidFunction;
};

export type PostSliceState = PostSliceValues & PostSliceActions;

const defaultValues: PostSliceValues = {
	currentlyEditedPost: undefined,

	posts: [],
	selectedPosts: [],
};

const sliceName = 'postSlice' as const;

const PostSlice = new Slice<PostSliceState, typeof sliceName>({
	name: sliceName,
	defaultValues,
	initializer: (set) => {
		return {
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
			},

			setPosts: (value) => {
				set((state) => {
					let newValue: PostSliceValues['posts'];

					if (_.isFunction(value)) {
						newValue = value(state.postSlice.posts);
					} else {
						newValue = value;
					}

					// eslint-disable-next-line no-param-reassign
					state.postSlice.posts = newValue;
				});
			},
		};
	},
});

export default PostSlice;

// ---- selectors ------------------------------------------------------------------------
export const selectCurrentlyEditedPost = (state: RootState) => {
	return state.postSlice.currentlyEditedPost;
};

export const selectPosts = (state: RootState) => {
	return state.postSlice.posts;
};

export const selectSetPosts = (state: RootState) => {
	return state.postSlice.setPosts;
};
