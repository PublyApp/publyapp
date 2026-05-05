import type { Components, Theme } from '@mui/material/styles';
import _ from 'lodash';
import { varAlpha } from 'minimal-shared/utils';

// ----------------------------------------------------------------------

const MuiSkeleton: Components<Theme>['MuiSkeleton'] = {
	/** **************************************
	 * DEFAULT PROPS
	 *************************************** */
	defaultProps: { animation: 'wave', variant: 'rounded' },

	/** **************************************
	 * STYLE
	 *************************************** */
	styleOverrides: {
		root: ({ theme }) => {
			return {
				backgroundColor: varAlpha(theme.vars.palette.grey['400Channel'], 0.12),
			};
		},
		rounded: ({ theme }) => {
			return { borderRadius: _.toNumber(theme.shape.borderRadius) * 2 };
		},
	},
};

// ----------------------------------------------------------------------

export const skeleton = { MuiSkeleton };
