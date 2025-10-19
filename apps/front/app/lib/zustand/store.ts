import { create } from 'zustand';
import { subscribeToNavLayout } from './features/settings.slice';
import { getInitialStore, type RootState } from './slices';
import { combinedMiddlewares } from './utils/middleware';

export const useMainStore = create<RootState>()(
	combinedMiddlewares((...a) => {
		return getInitialStore(...a);
	}),
);

subscribeToNavLayout(useMainStore);
