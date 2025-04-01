import { listClasses } from '@mui/material/List';
import type { Components, Theme } from '@mui/material/styles';

// ----------------------------------------------------------------------

const MuiPopover: Components<Theme>['MuiPopover'] = {
	/** **************************************
	 * STYLE
	 *************************************** */
	styleOverrides: {
		paper: ({ theme }) => {
			return {
				...theme.mixins.paperStyles(theme, { dropdown: true }),
				[`& .${listClasses.root}`]: { paddingTop: 0, paddingBottom: 0 },
			};
		},
	},
};

// ----------------------------------------------------------------------

export const popover = { MuiPopover };
