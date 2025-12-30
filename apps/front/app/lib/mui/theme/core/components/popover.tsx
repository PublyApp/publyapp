import type { Theme, Components } from '@mui/material/styles';

import { listClasses } from '@mui/material/List';

// ----------------------------------------------------------------------

const MuiPopover: Components<Theme>['MuiPopover'] = {
	/** **************************************
	 * DEFAULT PROPS
	 * UI Foundations popover defaults
	 *************************************** */
	defaultProps: {
		elevation: 1,
		transitionDuration: 225,
		anchorOrigin: {
			vertical: 'bottom',
			horizontal: 'center',
		},
		transformOrigin: {
			vertical: 'top',
			horizontal: 'center',
		},
	},
	/** **************************************
	 * STYLE
	 *************************************** */
	styleOverrides: {
		paper: ({ theme }) => ({
			...theme.mixins.paperStyles(theme, { dropdown: true }),
			transform: 'translateY(4px) !important',
			[`& .${listClasses.root}`]: { padding: 0 },
		}),
	},
};

// ----------------------------------------------------------------------

export const popover = { MuiPopover };
