import { FC } from 'react';

import ThemeProvider from '@aktiveo/ui-react/providers/ThemeProvider';
import '@aktiveo/ui-react/styles/fonts.css';

import AppRoutes from './AppRoutes';
import { AuthProvider } from '@aktiveo/ui-react/contexts/AuthProvider';
import AppProvider from '@aktiveo/ui-react/contexts/AppProvider';
import QueryProvider from '@aktiveo/ui-react/providers/QueryProvider';

const App: FC = () => {
	return (
		<AuthProvider>
			<AppProvider>
				<ThemeProvider>
					<QueryProvider>
						<AppRoutes />
					</QueryProvider>
				</ThemeProvider>
			</AppProvider>
		</AuthProvider>
	);
};

export default App;
