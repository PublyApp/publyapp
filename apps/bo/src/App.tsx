import { ThemeProvider } from '@emotion/react';
import { QueryClientProvider } from '@tanstack/react-query';

import { theme } from '@devist/ui-react/utils/theme';

import AppRoutes from './AppRoutes';
import { AuthProvider } from './contexts/AuthProvider';
import { queryClient } from './reactQuery/queryClient';
import AppProvider from './contexts/AppProvider';

const App = () => {
	return (
		<QueryClientProvider client={queryClient}>
			<AuthProvider>
				<ThemeProvider theme={theme}>
					<AppProvider>
						<AppRoutes />
					</AppProvider>
				</ThemeProvider>
			</AuthProvider>
		</QueryClientProvider>
	);
};

export default App;
