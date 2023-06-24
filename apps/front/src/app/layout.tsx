'use client';

import CssBaseline from '@mui/material/CssBaseline';
// import { ThemeProvider } from '@mui/material';
import { ThemeProvider } from '@emotion/react';

import { theme } from '@aktiveo/ui-react/utils/theme';

export default function RootLayout({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en">
			<head>
				<meta name="viewport" content="initial-scale=1, width=device-width" />
				<title>Aktiveo</title>
			</head>
			<ThemeProvider theme={theme}>
				<CssBaseline />
				<body>{children}</body>
			</ThemeProvider>
		</html>
	);
}
