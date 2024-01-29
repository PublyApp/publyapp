// import type { Theme } from '@mui/material';

// ----------------------------------------------------------------------

export const SvgIcon = (/* theme: Theme */) => {
	return {
		MuiSvgIcon: {
			styleOverrides: {
				fontSizeLarge: {
					width: 32,
					height: 32,
					fontSize: 'inherit',
				},
			},
		},
	};
};
