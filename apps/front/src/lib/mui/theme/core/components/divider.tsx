import type { Components, Theme } from '@mui/material/styles';

// ----------------------------------------------------------------------

/**
 * UI Foundations Divider styling:
 * - borderBottomWidth: 0.5
 */
const MuiDivider: Components<Theme>['MuiDivider'] = {
	/** **************************************
	 * STYLE
	 *************************************** */
	styleOverrides: {
		root: ({ theme }) => ({
			borderBottomWidth: 0.5,
			borderColor: theme.vars.palette.grey[200],
			...theme.applyStyles('dark', {
				borderColor: theme.vars.palette.grey[700],
			}),
		}),
	},
};

// ----------------------------------------------------------------------

export const divider = { MuiDivider };
