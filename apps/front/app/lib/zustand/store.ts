import * as cookie from 'cookie';
import { create } from 'zustand';
import { defaultSettings } from '@/front/components/settings';
import { SIDEBAR_COOKIE_MAX_AGE, SIDEBAR_COOKIE_NAME } from '../constants';
import { getInitialStore, type RootState } from './slices';
import { combinedMiddlewares } from './utils/middleware';

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
		const sidebarCookieValue =
			rootState.settingsSlice.state.navLayout ||
			(defaultSettings.navLayout as never);

		const sidebarCookie = cookie.serialize(
			SIDEBAR_COOKIE_NAME,
			sidebarCookieValue,
			{
				maxAge: SIDEBAR_COOKIE_MAX_AGE,
				path: '/',
			},
		);

		document.cookie = sidebarCookie;
	}
});
