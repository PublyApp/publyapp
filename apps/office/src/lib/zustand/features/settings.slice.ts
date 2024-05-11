import type { Dispatch, SetStateAction } from 'react';

import _ from 'lodash';

// import type { IPostWithRelations, TranslatedIPostWithRelations } from '@/shared/types/db/post.types';

import type { RootState } from '../slices';
import Slice from '../utils/Slice';

export type SettingsSliceValues = {
	// edit post page
	// currentlyEditedPost: IPostWithRelations | undefined;

	// posts list (table)
	// posts: TranslatedIPostWithRelations[];
	// selectedPosts: TranslatedIPostWithRelations[];

	sideBar: 'mini' | 'large';
};

export type SettingsSliceActions = {
	setSidebar: Dispatch<SetStateAction<SettingsSliceValues['sideBar']>>;

	// setPosts: Dispatch<SetStateAction<SettingsSliceValues['posts']>>;
	// addPost: VoidFunction;
	// removePost: VoidFunction;
	// updatePost: VoidFunction;
};

export type SettingsSliceState = SettingsSliceValues & SettingsSliceActions;

const defaultValues: SettingsSliceValues = {
	// currentlyEditedPost: undefined,

	// posts: [],
	// selectedPosts: [],
	sideBar: 'large',
};

const sliceName = 'settingsSlice' as const;

const settingsSlice = new Slice<SettingsSliceState, typeof sliceName>({
	name: sliceName,
	defaultValues,
	initializer: (set) => {
		return {
			...defaultValues,

			setSidebar: (value) => {
				set((state) => {
					let newValue: SettingsSliceValues['sideBar'];

					if (_.isFunction(value)) {
						newValue = value(state.settingsSlice.sideBar);
					} else {
						newValue = value;
					}

					// eslint-disable-next-line no-param-reassign
					state.settingsSlice.sideBar = newValue;
				});
			},
		};
	},
});

export default settingsSlice;

// ---- selectors ------------------------------------------------------------------------
export const selectSidebar = (state: RootState) => {
	return state.settingsSlice.sideBar;
};

export const selectSetSidebar = (state: RootState) => {
	return state.settingsSlice.setSidebar;
};
