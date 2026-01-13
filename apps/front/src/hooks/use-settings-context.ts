import { useMainStore } from '@/front/lib/zustand/store';

export const useSettingsContext = () => {
	const slice = useMainStore((root) => {
		return root.settingsSlice;
	});

	return slice;
};
