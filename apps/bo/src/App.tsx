import { ThemeProvider } from '@emotion/react';
import { createTheme } from '@mui/material';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import AppRoutes from './AppRoutes';
import { AuthProvider } from './contexts/auth/AuthProvider';

const queryClient = new QueryClient();

const theme = createTheme();

const App = () => {
	return (
		<QueryClientProvider client={queryClient}>
			<AuthProvider>
				<ThemeProvider theme={theme}>
					<AppRoutes />
				</ThemeProvider>
			</AuthProvider>
		</QueryClientProvider>
	);
};

export default App;
