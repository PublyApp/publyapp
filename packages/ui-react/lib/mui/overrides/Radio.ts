import type { Theme } from '@mui/material/styles';

// ----------------------------------------------------------------------

export const Radio = (theme: Theme) => {
	return {
		// CHECKBOX, RADIO, SWITCH
		MuiFormControlLabel: {
			styleOverrides: {
				label: {
					...theme.typography.body2,
				},
			},
		},

		MuiRadio: {
			styleOverrides: {
				root: {
					padding: theme.spacing(1),
				},
			},
		},
	};
};
