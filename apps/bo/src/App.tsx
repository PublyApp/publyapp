import { FC } from 'react';

import { ThemeProvider } from '@emotion/react';

import { theme } from '@aktiveo/ui-react/utils/theme';
import '@aktiveo/ui-react/styles/fonts.css';

import AppRoutes from './AppRoutes';
import { AuthProvider } from './contexts/AuthProvider';
import AppProvider from './contexts/AppProvider';
import QueryProvider from './providers/QueryProvider';

const App: FC = () => {
	return (
		<AuthProvider>
			<AppProvider>
				<ThemeProvider theme={theme}>
					<QueryProvider>
						<AppRoutes />
					</QueryProvider>
				</ThemeProvider>
			</AppProvider>
		</AuthProvider>
	);
};

export default App;
