import type { Theme } from '@mui/material/styles';

// ----------------------------------------------------------------------

export const CheckBox = (theme: Theme) => {
	return {
		MuiCheckbox: {
			styleOverrides: {
				root: {
					padding: theme.spacing(1),
				},
			},
		},
	};
};
