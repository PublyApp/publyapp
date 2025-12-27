import { createTheme } from '@mui/material/styles';

export const theme = createTheme({
	cssVariables: {
		colorSchemeSelector: 'class',
	},
	colorSchemes: {
		light: {
			palette: {
				primary: {
					main: '#1976d2',
					light: '#42a5f5',
					dark: '#1565c0',
					contrastText: '#fff',
				},
				secondary: {
					main: '#9c27b0',
					light: '#ba68c8',
					dark: '#7b1fa2',
					contrastText: '#fff',
				},
				background: {
					default: '#f5f5f5',
					paper: '#ffffff',
				},
			},
		},
		dark: {
			palette: {
				primary: {
					main: '#90caf9',
					light: '#e3f2fd',
					dark: '#42a5f5',
					contrastText: 'rgba(0, 0, 0, 0.87)',
				},
				secondary: {
					main: '#ce93d8',
					light: '#f3e5f5',
					dark: '#ab47bc',
					contrastText: 'rgba(0, 0, 0, 0.87)',
				},
				background: {
					default: '#121212',
					paper: '#1e1e1e',
				},
			},
		},
	},
	typography: {
		fontFamily:
			'"Inter Variable", "Public Sans Variable", "Roboto", "Helvetica", "Arial", sans-serif',
		h1: {
			fontWeight: 700,
		},
		h2: {
			fontWeight: 700,
		},
		h3: {
			fontWeight: 600,
		},
		h4: {
			fontWeight: 600,
		},
		h5: {
			fontWeight: 500,
		},
		h6: {
			fontWeight: 500,
		},
	},
	shape: {
		borderRadius: 8,
	},
	components: {
		MuiButton: {
			styleOverrides: {
				root: {
					textTransform: 'none',
					fontWeight: 600,
				},
			},
		},
		MuiCard: {
			styleOverrides: {
				root: {
					boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
				},
			},
		},
	},
});
