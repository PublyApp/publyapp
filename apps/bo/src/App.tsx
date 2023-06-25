import { ThemeProvider } from '@emotion/react';

import { theme } from '@aktiveo/ui-react/utils/theme';
import '@aktiveo/ui-react/styles/fonts.css';

import AppRoutes from './AppRoutes';
import { AuthProvider } from './contexts/AuthProvider';
import AppProvider from './contexts/AppProvider';
import QueryProvider from './providers/QueryProvider';

const App = () => {
	return (
		<AuthProvider>
			<QueryProvider>
				<ThemeProvider theme={theme}>
					<AppProvider>
						<AppRoutes />
					</AppProvider>
				</ThemeProvider>
			</QueryProvider>
		</AuthProvider>
	);
};

export default App;
