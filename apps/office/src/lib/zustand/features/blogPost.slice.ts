import type { Dispatch, SetStateAction } from 'react';

import _ from 'lodash';

import type { IBlogPostWithRelations, TranslatedIBlogPostWithRelations } from '@/shared/types/db/blogPost.types';

import type { RootState } from '../slices';
import Slice from '../utils/Slice';

export type BlogPostSliceValues = {
	// edit post page
	currentlyEditedPost: IBlogPostWithRelations | undefined;
	isOpenSlugDrawer: boolean;

	// posts list (table)
	posts: TranslatedIBlogPostWithRelations[];
	selectedPosts: TranslatedIBlogPostWithRelations[];
};

export type PostSliceActions = {
	setCurrentlyEditedPost: Dispatch<SetStateAction<BlogPostSliceValues['currentlyEditedPost']>>;
	setIsOpenSlugDrawer: Dispatch<SetStateAction<BlogPostSliceValues['isOpenSlugDrawer']>>;

	setPosts: Dispatch<SetStateAction<BlogPostSliceValues['posts']>>;
	// addPost: VoidFunction;
	// removePost: VoidFunction;
	// updatePost: VoidFunction;
};

export type BlogPostSliceState = BlogPostSliceValues & PostSliceActions;

const defaultValues: BlogPostSliceValues = {
	currentlyEditedPost: undefined,
	isOpenSlugDrawer: false,

	posts: [],
	selectedPosts: [],
};

const sliceName = 'blogPostSlice' as const;

const blogPostSlice = new Slice<BlogPostSliceState, typeof sliceName>({
	name: sliceName,
	defaultValues,
	initializer: (set) => {
		return {
			...defaultValues,

			setCurrentlyEditedPost: (value) => {
				set((state) => {
					let newValue: BlogPostSliceValues['currentlyEditedPost'];

					if (_.isFunction(value)) {
						newValue = value(state.blogPostSlice.currentlyEditedPost);
					} else {
						newValue = value;
					}

					// eslint-disable-next-line no-param-reassign
					state.blogPostSlice.currentlyEditedPost = newValue;
				});
			},

			setIsOpenSlugDrawer: (value) => {
				set((state) => {
					let newValue: BlogPostSliceValues['isOpenSlugDrawer'];

					if (_.isFunction(value)) {
						newValue = value(state.blogPostSlice.isOpenSlugDrawer);
					} else {
						newValue = value;
					}

					// eslint-disable-next-line no-param-reassign
					state.blogPostSlice.isOpenSlugDrawer = newValue;
				});
			},

			setPosts: (value) => {
				set((state) => {
					let newValue: BlogPostSliceValues['posts'];

					if (_.isFunction(value)) {
						newValue = value(state.blogPostSlice.posts);
					} else {
						newValue = value;
					}

					// eslint-disable-next-line no-param-reassign
					state.blogPostSlice.posts = newValue;
				});
			},
		};
	},
});

export default blogPostSlice;

// ---- selectors ------------------------------------------------------------------------
export const selectCurrentlyEditedPost = (state: RootState) => {
	return state.blogPostSlice.currentlyEditedPost;
};

export const selectSetCurrentlyEditedPost = (state: RootState) => {
	return state.blogPostSlice.setCurrentlyEditedPost;
};

export const selectIsOpenSlugDrawer = (state: RootState) => {
	return state.blogPostSlice.isOpenSlugDrawer;
};

export const selectSetIsOpenSlugDrawer = (state: RootState) => {
	return state.blogPostSlice.setIsOpenSlugDrawer;
};

export const selectPosts = (state: RootState) => {
	return state.blogPostSlice.posts;
};

export const selectSetPosts = (state: RootState) => {
	return state.blogPostSlice.setPosts;
};
