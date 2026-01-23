import type { Components, Theme } from '@mui/material/styles';

// ----------------------------------------------------------------------

/**
 * UI Foundations Paper styling:
 * - elevation: 0
 * - borderWidth: 0.5
 * - borderStyle: 'solid'
 * - borderColor: gray[200]
 */
const MuiPaper: Components<Theme>['MuiPaper'] = {
	/** **************************************
	 * DEFAULT PROPS
	 *************************************** */
	defaultProps: { elevation: 0 },

	/** **************************************
	 * STYLE
	 *************************************** */
	styleOverrides: {
		root: ({ theme }) => ({
			backgroundImage: 'none',
			borderColor: theme.vars.palette.grey[200],
			color: theme.vars.palette.grey[800],
			borderWidth: 0.5,
			borderStyle: 'solid',
			...theme.applyStyles('dark', {
				borderColor: theme.vars.palette.grey[700],
				color: theme.vars.palette.grey[200],
			}),
		}),
		outlined: ({ theme }) => ({
			borderColor: theme.vars.palette.grey[200],
			...theme.applyStyles('dark', {
				borderColor: theme.vars.palette.grey[700],
			}),
		}),
	},
};

// ----------------------------------------------------------------------

export const paper = { MuiPaper };
