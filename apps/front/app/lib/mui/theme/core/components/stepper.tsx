import type { Components, Theme } from '@mui/material/styles';

// ----------------------------------------------------------------------

const MuiStepConnector: Components<Theme>['MuiStepConnector'] = {
	/** **************************************
	 * STYLE
	 *************************************** */
	styleOverrides: {
		line: ({ theme }) => {
			return { borderColor: theme.vars.palette.divider };
		},
	},
};

// ----------------------------------------------------------------------

export const stepper = { MuiStepConnector };
