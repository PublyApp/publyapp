// import { ThemeProvider } from '@emotion/react';
import { ThemeProvider } from '@emotion/react';
import { QueryClientProvider } from '@tanstack/react-query';

import { theme } from '@aktiveo/ui-react/utils/theme';

import AppRoutes from './AppRoutes';
import { AuthProvider } from './contexts/AuthProvider';
import { queryClient } from './query/queryClient';
import AppProvider from './contexts/AppProvider';

const App = () => {
	return (
		<AuthProvider>
			<QueryClientProvider client={queryClient}>
				<ThemeProvider theme={theme}>
					<AppProvider>
						<AppRoutes />
					</AppProvider>
				</ThemeProvider>
			</QueryClientProvider>
		</AuthProvider>
	);
};

export default App;
