import { createTheme } from '@mui/material';

const colors = {
	black: '#121213',
};

export const theme = createTheme({
	palette: {
		black: colors.black,
		text: {
			primary: colors.black,
		},
	},
	typography: {
		fontFamily: ['Poppins'].join(', '),
		// body2: {
		// 	fontSize: '14px',
		// 	fontWeight: 400,
		// },
	},
});
