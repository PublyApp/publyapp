import _ from 'lodash';
import * as cookie from 'cookie';
import { create } from 'zustand';
import { getInitialStore, type RootState } from './slices';
import { combinedMiddlewares } from './utils/middleware';
import { SIDEBAR_COOKIE_MAX_AGE, SIDEBAR_COOKIE_NAME } from '../constants';
import { defaultSettings } from '@/front/components/settings';

export const useMainStore = create<RootState>()(
	combinedMiddlewares((...a) => {
		return getInitialStore(...a);
	}),
);

useMainStore.subscribe((rootState, prevRootState) => {
	if (
		rootState.settingsSlice.state.navLayout !==
		prevRootState.settingsSlice.state.navLayout
	) {
		const sidebarCookie = cookie.serialize(
			SIDEBAR_COOKIE_NAME,
			rootState.settingsSlice.state.navLayout ||
				(defaultSettings.navLayout as never),
			{
				maxAge: SIDEBAR_COOKIE_MAX_AGE,
				path: '/',
			},
		);

		document.cookie = sidebarCookie;
	}
});
