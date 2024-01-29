import type { Theme } from '@mui/material';

// ----------------------------------------------------------------------

export const Typography = (theme: Theme) => {
	return {
		MuiTypography: {
			styleOverrides: {
				paragraph: {
					marginBottom: theme.spacing(2),
				},
				gutterBottom: {
					marginBottom: theme.spacing(1),
				},
			},
		},
	};
};
