import _ from 'lodash';

import { defaultSettings } from '@/front/components/settings/settings-config';
import type { SettingsState } from '@/front/components/settings/types';

import Slice from '../utils/Slice';

export type SettingsSliceValues = {
	openDrawer: boolean;
	state: SettingsState;
	canReset: boolean;
};

export type SettingsSliceActions = {
	onToggleDrawer: () => void;
	onCloseDrawer: () => void;
	onReset: () => void;
	setState: (updateState: SettingsState | Partial<SettingsState>) => void;

	// biome-ignore lint/suspicious/noExplicitAny: use any for now
	setField: (path: string, value: any) => void;
};

export type SettingsSliceState = SettingsSliceValues & SettingsSliceActions;

const defaultValues: SettingsSliceValues = {
	openDrawer: false,
	state: defaultSettings,
	canReset: true,
};

const sliceName = 'settingsSlice' as const;

const customizer = (objValue: unknown, srcValue: unknown) => {
	if (_.isArray(objValue)) {
		return objValue.concat(srcValue);
	}

	return undefined;
};

const settingsSlice = new Slice<
	typeof sliceName,
	SettingsSliceValues,
	SettingsSliceActions
>({
	name: sliceName,
	defaultValues,
	initializer: (set) => {
		return {
			...defaultValues,

			onToggleDrawer: () => {
				set((state) => {
					state.settingsSlice.openDrawer = !state.settingsSlice.openDrawer;
				});
			},
			onCloseDrawer: () => {
				set((state) => {
					state.settingsSlice.openDrawer = false;
				});
			},
			onReset: () => {
				set((state) => {
					state.settingsSlice.state = defaultSettings;
				});
			},
			setState: (updateState) => {
				set((state) => {
					state.settingsSlice.state = _.mergeWith(
						state.settingsSlice.state,
						updateState,
						customizer,
					);
				});
			},
			setField: (path, value) => {
				set((state) => {
					_.set(state.settingsSlice.state, path, value);
				});
			},
		};
	},
});

export default settingsSlice;

// ---- selectors ------------------------------------------------------------------------

// export const selectSidebarState = (state: RootState) => {
// 	return state.settingsSlice.sidebar.state;
// };

// export const selectToggleSidebar = (state: RootState) => {
// 	return state.settingsSlice.sidebarActions.toggleSidebar;
// };

// export const selectSetSidebarState = (state: RootState) => {
// 	return state.settingsSlice.sidebarActions.setSideBarState;
// };
