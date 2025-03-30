import type { Components, Theme } from '@mui/material/styles';

// ----------------------------------------------------------------------

const MuiStack: Components<Theme>['MuiStack'] = {
	/** **************************************
	 * DEFAULT PROPS
	 *************************************** */
	defaultProps: { useFlexGap: true },

	/** **************************************
	 * STYLE
	 *************************************** */
	styleOverrides: {},
};

// ----------------------------------------------------------------------

export const stack = { MuiStack };
