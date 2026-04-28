import * as cookie from 'cookie';
import isArray from 'lodash/isArray';
import mergeWith from 'lodash/mergeWith';
import lodashSet from 'lodash/set';

import { defaultSettings } from '#app/components/settings/settings-config.ts';
import type { SettingsState } from '#app/components/settings/types.ts';
import { createSettingsSyncId } from '#app/lib/settings/settings-sync-state.client.ts';

import { SIDEBAR_COOKIE_MAX_AGE, SIDEBAR_COOKIE_NAME } from '../../constants';
import type { useMainStore } from '../store';
import Slice from '../utils/Slice';

export type SettingsSliceValues = {
	openDrawer: boolean;
	canReset: boolean;
	state: SettingsState;
	revision: number;
	updatedAt: number;
	syncId: string;
};

export type SettingsSliceActions = {
	onToggleDrawer: () => void;
	onCloseDrawer: () => void;
	onReset: () => void;
	setState: (updateState: SettingsState | Partial<SettingsState>) => void;

	setField: (path: string, value: unknown) => void;
};

export type SettingsSliceState = SettingsSliceValues & SettingsSliceActions;

const defaultValues: SettingsSliceValues = {
	openDrawer: false,
	canReset: true,
	state: defaultSettings,
	revision: 0,
	updatedAt: 0,
	syncId: '',
};

const sliceName = 'settingsSlice' as const;

const customizer = (objValue: unknown, srcValue: unknown) => {
	if (isArray(objValue)) {
		return objValue.concat(srcValue);
	}

	return undefined;
};

const markSettingsChanged = (state: { settingsSlice: SettingsSliceValues }) => {
	// Every local settings mutation advances the snapshot metadata persisted by
	// Zustand. Remote tabs use this to reject stale delayed storage events.
	state.settingsSlice.revision += 1;
	state.settingsSlice.updatedAt = Date.now();
	state.settingsSlice.syncId = createSettingsSyncId();
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
					markSettingsChanged(state);
				});
			},
			setState: (updateState) => {
				set((state) => {
					state.settingsSlice.state = mergeWith(
						state.settingsSlice.state,
						updateState,
						customizer,
					);
					markSettingsChanged(state);
				});
			},
			setField: (path, value) => {
				set((state) => {
					lodashSet(state.settingsSlice.state, path, value);
					markSettingsChanged(state);
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

// -----------------------------------------------------------------------------------------

export const subscribeToNavLayout = (store: typeof useMainStore) => {
	store.subscribe((rootState, prevRootState) => {
		const navLayout = rootState.settingsSlice.state.navLayout;
		const prevNavLayout = prevRootState.settingsSlice.state.navLayout;
		if (navLayout !== prevNavLayout) {
			const sidebarCookieValue = navLayout || defaultSettings.navLayout;

			const sidebarCookie = cookie.serialize(
				SIDEBAR_COOKIE_NAME,
				sidebarCookieValue || 'vertical',
				{
					maxAge: SIDEBAR_COOKIE_MAX_AGE,
					path: '/',
				},
			);

			document.cookie = sidebarCookie;
		}
	});
};
