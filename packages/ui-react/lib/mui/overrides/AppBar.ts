// import type { Theme } from '@mui/material/styles';

// ----------------------------------------------------------------------

export const AppBar = (/* theme: Theme */) => {
	return {
		MuiAppBar: {
			styleOverrides: {
				root: {
					boxShadow: 'none',
				},
			},
		},
	};
};
