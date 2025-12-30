import type { Theme, Components } from '@mui/material/styles';

import { varAlpha } from 'minimal-shared/utils';

import { menuItemClasses } from '@mui/material/MenuItem';

// ----------------------------------------------------------------------

/**
 * UI Foundations Menu styling
 */
const MuiMenu: Components<Theme>['MuiMenu'] = {
	/** **************************************
	 * DEFAULT PROPS
	 *************************************** */
	defaultProps: {
		elevation: 2,
	},
	/** **************************************
	 * STYLE
	 *************************************** */
	styleOverrides: {
		list: {
			padding: 0,
			display: 'flex',
			flexDirection: 'column',
			gap: '2px',
		},
		paper: ({ theme }) => ({
			...theme.mixins.paperStyles(theme, { dropdown: true }),
		}),
	},
};

const MuiMenuItem: Components<Theme>['MuiMenuItem'] = {
	/** **************************************
	 * DEFAULT PROPS
	 *************************************** */
	defaultProps: {
		dense: true,
	},
	/** **************************************
	 * STYLE
	 * Explicit height: 36px for regular, 32px for dense
	 *************************************** */
	styleOverrides: {
		root: ({ theme }) => ({
			...theme.mixins.menuItemStyles(theme),
			minHeight: 30,
			'&:hover': {
				backgroundColor: varAlpha(theme.vars.palette.grey['500Channel'], 0.08),
			},
			[`&.${menuItemClasses.focusVisible}`]: {
				backgroundColor: varAlpha(theme.vars.palette.grey['500Channel'], 0.12),
			},
			[`&.${menuItemClasses.selected}`]: {
				backgroundColor: varAlpha(theme.vars.palette.primary.mainChannel, 0.08),
				'&:hover': {
					backgroundColor: varAlpha(
						theme.vars.palette.primary.mainChannel,
						0.12,
					),
				},
			},
		}),
		dense: {
			minHeight: 30,
		},
	},
};

// ----------------------------------------------------------------------

export const menu = { MuiMenu, MuiMenuItem };
