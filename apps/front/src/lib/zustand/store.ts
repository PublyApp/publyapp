import { create } from 'zustand';

import { subscribeToNavLayout } from './features/settings.slice';
import { getInitialStore, type RootState } from './slices';
import { combinedMiddlewaresWithSettingsPersist } from './utils/middleware';

export const useMainStore = create<RootState>()(
	combinedMiddlewaresWithSettingsPersist((...a) => {
		return getInitialStore(...a);
	}),
);

subscribeToNavLayout(useMainStore);
