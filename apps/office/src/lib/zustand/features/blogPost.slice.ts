import type { Dispatch, SetStateAction } from 'react';

import _ from 'lodash';

import type { IBlogPostWithRelations, TranslatedIBlogPostWithRelations } from '@/shared/types/db/blogPost.types';

import type { RootState } from '../slices';
import Slice from '../utils/Slice';

export type PostSliceValues = {
	// edit post page
	currentlyEditedPost: IBlogPostWithRelations | undefined;

	// posts list (table)
	posts: TranslatedIBlogPostWithRelations[];
	selectedPosts: TranslatedIBlogPostWithRelations[];
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

const postSlice = new Slice<PostSliceState, typeof sliceName>({
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

export default postSlice;

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
