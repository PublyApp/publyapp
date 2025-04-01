import type { Components, Theme } from '@mui/material/styles';
import { varAlpha } from 'minimal-shared/utils';

// ----------------------------------------------------------------------

const MuiPaper: Components<Theme>['MuiPaper'] = {
	/** **************************************
	 * DEFAULT PROPS
	 *************************************** */
	defaultProps: { elevation: 0 },

	/** **************************************
	 * STYLE
	 *************************************** */
	styleOverrides: {
		root: { backgroundImage: 'none' },
		outlined: ({ theme }) => {
			return {
				borderColor: varAlpha(theme.vars.palette.grey['500Channel'], 0.16),
			};
		},
	},
};

// ----------------------------------------------------------------------

export const paper = { MuiPaper };
