import type { FC } from 'react';

import { ToastContainer } from 'react-toastify';

import 'react-toastify/dist/ReactToastify.css';
import '@devist/ui-react/styles/fonts.css';

import AppProvider from '@devist/ui-react/contexts/AppProvider';
import QueryProvider from '@devist/ui-react/providers/QueryProvider';
import ThemeProvider from '@devist/ui-react/providers/ThemeProvider';
import defaultQueryClient from '@devist/ui-react/query/queryClient';

// import { AuthProvider } from '@devist/ui-react/contexts/AuthProvider';

import AppRoutes from './AppRoutes';

const App: FC = () => {
	return (
		<QueryProvider queryClient={defaultQueryClient}>
			<AppProvider>
				<ThemeProvider>
					<AppRoutes />
					<ToastContainer />
				</ThemeProvider>
			</AppProvider>
		</QueryProvider>
	);
};

export default App;
