import _ from 'lodash';
import { create } from 'zustand';

import { getInitialStore, type RootState } from './slices';
import { combinedMiddlewares } from './utils/middleware';

export const useMainStore = create<RootState>()(
	combinedMiddlewares((...a) => {
		return getInitialStore(...a);
	}),
);
