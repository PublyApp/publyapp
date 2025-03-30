import { use } from 'react';

import { useMainStore } from '@/front/lib/zustand/store';

import { SettingsContext } from './settings-context';

// ----------------------------------------------------------------------

export const useSettingsContext = () => {
	// const context = use(SettingsContext);

	// if (!context) throw new Error('useSettingsContext must be use inside SettingsProvider');
	const slice = useMainStore((root) => {
		return root.settingsSlice;
	});

	return slice;
};
