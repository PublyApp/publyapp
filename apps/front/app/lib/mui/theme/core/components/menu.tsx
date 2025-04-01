import type { Components, Theme } from '@mui/material/styles';

// ----------------------------------------------------------------------

const MuiMenuItem: Components<Theme>['MuiMenuItem'] = {
	/** **************************************
	 * STYLE
	 *************************************** */
	styleOverrides: {
		root: ({ theme }) => {
			return { ...theme.mixins.menuItemStyles(theme) };
		},
	},
};

// ----------------------------------------------------------------------

export const menu = { MuiMenuItem };
