import { FC } from 'react';

import '@aktiveo/ui-react/styles/fonts.css';

import AppProvider from '@aktiveo/ui-react/contexts/AppProvider';
import QueryProvider from '@aktiveo/ui-react/providers/QueryProvider';
import ThemeProvider from '@aktiveo/ui-react/providers/ThemeProvider';
import defaultQueryClient from '@aktiveo/ui-react/query/queryClient';

// import { AuthProvider } from '@aktiveo/ui-react/contexts/AuthProvider';

import AppRoutes from './AppRoutes';

const App: FC = () => {
	return (
		<QueryProvider queryClient={defaultQueryClient}>
			<AppProvider>
				<ThemeProvider>
					<AppRoutes />
				</ThemeProvider>
			</AppProvider>
		</QueryProvider>
	);
};

export default App;
