import type { Theme } from '@mui/material';

// ----------------------------------------------------------------------

export const Stepper = (theme: Theme) => {
	return {
		MuiStepConnector: {
			styleOverrides: {
				line: {
					borderColor: theme.palette.divider,
				},
			},
		},
	};
};
