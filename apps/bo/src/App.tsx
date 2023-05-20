import { ThemeProvider } from '@emotion/react';
import { createTheme } from '@mui/material';

import AppRoutes from './AppRoutes';

const theme = createTheme();

const App = () => {
	return (
		<ThemeProvider theme={theme}>
			<AppRoutes />
		</ThemeProvider>
	);
};

export default App;
