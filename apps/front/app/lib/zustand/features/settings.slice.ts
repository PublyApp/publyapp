import type { RootState } from '../slices';
import Slice from '../utils/Slice';

export type SettingsSliceValues = {
	// isOpenNav: boolean;
	sidebar: {
		state: 'expanded' | 'collapsed';
	};
};

export type SettingsSliceActions = {
	sidebarActions: {
		toggleSidebar: () => void;
	};
	// setIsOpenNav: Dispatch<SetStateAction<SettingsSliceValues['isOpenNav']>>;
};

export type SettingsSliceState = SettingsSliceValues & SettingsSliceActions;

const defaultValues: SettingsSliceValues = {
	// isOpenNav: true,
	sidebar: {
		state: 'expanded',
	},
};

const sliceName = 'settingsSlice' as const;

const settingsSlice = new Slice<typeof sliceName, SettingsSliceValues, SettingsSliceActions>({
	name: sliceName,
	defaultValues,
	initializer: (set) => {
		return {
			...defaultValues,

			sidebarActions: {
				toggleSidebar: () => {
					set((state) => {
						const newValue = state.settingsSlice.sidebar.state === 'expanded' ? 'collapsed' : 'expanded';
						// eslint-disable-next-line no-param-reassign
						state.settingsSlice.sidebar.state = newValue;
					});
				},
			},
			// setIsOpenNav: (value) => {
			// 	set((state) => {
			// 		let newValue: SettingsSliceValues['isOpenNav'];

			// 		if (_.isFunction(value)) {
			// 			newValue = value(state.settingsSlice.isOpenNav);
			// 		} else {
			// 			newValue = value;
			// 		}

			// 		// eslint-disable-next-line no-param-reassign
			// 		state.settingsSlice.isOpenNav = newValue;
			// 	});
			// },
		};
	},
});

export default settingsSlice;

// ---- selectors ------------------------------------------------------------------------

export const selectSidebarState = (state: RootState) => {
	return state.settingsSlice.sidebar.state;
};

export const selectToggleSidebar = (state: RootState) => {
	return state.settingsSlice.sidebarActions.toggleSidebar;
};
