import _ from 'lodash';
import type { Dispatch, SetStateAction } from 'react';

import { SIDEBAR_COOKIE_NAME } from '../../constants';
import { CookieManager } from '../../cookie-manager';
import type { RootState } from '../slices';
import Slice from '../utils/Slice';

export type SettingsSliceValues = {
	// isOpenNav: boolean;
	sidebar: {
		state: 'expanded' | 'collapsed';
	};
};

export type SettingsSliceActions = {
	sidebarActions: {
		toggleSidebar: () => void;
		setSideBarState: Dispatch<SetStateAction<SettingsSliceValues['sidebar']['state']>>;
	};
};

export type SettingsSliceState = SettingsSliceValues & SettingsSliceActions;

const defaultValues: SettingsSliceValues = {
	// isOpenNav: true,
	sidebar: {
		state: 'expanded',
	},
};

const sliceName = 'settingsSlice' as const;

const settingsSlice = new Slice<typeof sliceName, SettingsSliceValues, SettingsSliceActions>({
	name: sliceName,
	defaultValues,
	initializer: (set) => {
		return {
			...defaultValues,

			sidebarActions: {
				toggleSidebar: () => {
					set((state) => {
						const newValue = state.settingsSlice.sidebar.state === 'expanded' ? 'collapsed' : 'expanded';

						const cookies = new CookieManager();
						cookies.set(SIDEBAR_COOKIE_NAME, newValue);

						// eslint-disable-next-line no-param-reassign
						state.settingsSlice.sidebar.state = newValue;
					});
				},
				setSideBarState: (value) => {
					set((state) => {
						let newValue: SettingsSliceValues['sidebar']['state'];

						if (_.isFunction(value)) {
							newValue = value(state.settingsSlice.sidebar.state);
						} else {
							newValue = value;
						}

						const cookies = new CookieManager();
						cookies.set(SIDEBAR_COOKIE_NAME, newValue);

						// eslint-disable-next-line no-param-reassign
						state.settingsSlice.sidebar.state = newValue;
					});
				},
			},
		};
	},
});

export default settingsSlice;

// ---- selectors ------------------------------------------------------------------------

export const selectSidebarState = (state: RootState) => {
	return state.settingsSlice.sidebar.state;
};

export const selectToggleSidebar = (state: RootState) => {
	return state.settingsSlice.sidebarActions.toggleSidebar;
};

export const selectSetSidebarState = (state: RootState) => {
	return state.settingsSlice.sidebarActions.setSideBarState;
};
