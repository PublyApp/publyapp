import type { Components, Theme } from '@mui/material/styles';
import _ from 'lodash';

// ----------------------------------------------------------------------

const MuiCard: Components<Theme>['MuiCard'] = {
	/** **************************************
	 * STYLE
	 *************************************** */
	styleOverrides: {
		root: ({ theme }) => {
			return {
				position: 'relative',
				boxShadow: theme.vars.customShadows.card,
				borderRadius: _.toNumber(theme.shape.borderRadius) * 2,
				zIndex: 0, // Fix Safari overflow: hidden with border radius
			};
		},
	},
};

// ----------------------------------------------------------------------

const MuiCardHeader: Components<Theme>['MuiCardHeader'] = {
	/** **************************************
	 * DEFAULT PROPS
	 *************************************** */
	defaultProps: {
		titleTypographyProps: { variant: 'h6' },
		subheaderTypographyProps: { variant: 'body2', marginTop: '4px' },
	},

	/** **************************************
	 * STYLE
	 *************************************** */
	styleOverrides: {
		root: ({ theme }) => {
			return { padding: theme.spacing(3, 3, 0) };
		},
	},
};

// ----------------------------------------------------------------------

const MuiCardContent: Components<Theme>['MuiCardContent'] = {
	/** **************************************
	 * STYLE
	 *************************************** */
	styleOverrides: {
		root: ({ theme }) => {
			return { padding: theme.spacing(3) };
		},
	},
};

// ----------------------------------------------------------------------

export const card = { MuiCard, MuiCardHeader, MuiCardContent };
