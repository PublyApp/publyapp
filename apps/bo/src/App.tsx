import { ThemeProvider } from '@emotion/react';
import { createTheme } from '@mui/material';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import AppRoutes from './AppRoutes';
import { AuthProvider } from './contexts/auth/AuthProvider';

// const queryClient = new QueryClient();
const twentyFourHoursInMs = 1000 * 60 * 60 * 24;
const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			refetchOnWindowFocus: false,
			// refetchOnmount: false,
			refetchOnReconnect: false,
			retry: false,
			staleTime: twentyFourHoursInMs,
		},
	},
});

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
