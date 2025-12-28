import type { Theme, Components } from '@mui/material/styles';

import { tabClasses } from '@mui/material/Tab';

// ----------------------------------------------------------------------

const MuiTabs: Components<Theme>['MuiTabs'] = {
	/** **************************************
	 * DEFAULT PROPS
	 *************************************** */
	defaultProps: {
		textColor: 'inherit',
		variant: 'scrollable',
		allowScrollButtonsMobile: true,
	},

	/** **************************************
	 * STYLE
	 * Compact with responsive gap restored
	 *************************************** */
	styleOverrides: {
		flexContainer: ({ ownerState, theme }) => ({
			...(ownerState.variant !== 'fullWidth' && {
				gap: theme.spacing(3), // 24px base
				[theme.breakpoints.up('sm')]: { gap: theme.spacing(4) }, // 32px on sm+
			}),
		}),
		indicator: { backgroundColor: 'currentColor' },
	},
};

// ----------------------------------------------------------------------

const MuiTab: Components<Theme>['MuiTab'] = {
	/** **************************************
	 * DEFAULT PROPS
	 *************************************** */
	defaultProps: { disableRipple: true, iconPosition: 'start' },

	/** **************************************
	 * STYLE
	 * Compact sizing with restored lineHeight
	 *************************************** */
	styleOverrides: {
		root: ({ theme }) => ({
			opacity: 1,
			minWidth: 48,
			minHeight: 40,
			padding: theme.spacing(1, 0),
			textTransform: 'none',
			fontSize: theme.typography.pxToRem(13),
			color: theme.vars.palette.text.secondary,
			fontWeight: theme.typography.fontWeightMedium,
			lineHeight: theme.typography.body2.lineHeight,
			[`&.${tabClasses.selected}`]: {
				color: theme.vars.palette.text.primary,
				fontWeight: theme.typography.fontWeightSemiBold,
			},
		}),
	},
};

// ----------------------------------------------------------------------

export const tabs = { MuiTabs, MuiTab };
