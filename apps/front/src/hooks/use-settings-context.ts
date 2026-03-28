import { useMainStore } from '#app/lib/zustand/store.ts';

export const useSettingsContext = () => {
	const slice = useMainStore((root) => {
		return root.settingsSlice;
	});

	return slice;
};
