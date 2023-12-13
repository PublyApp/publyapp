import type { FC } from 'react';

import '@devist/ui-react/styles/fonts.css';

import MotionLazy from '@devist/ui-react/components/MotionLazy';
import defaultQueryClient from '@devist/ui-react/lib/react-query/queryClient';
import QueryProvider from '@devist/ui-react/providers/QueryProvider';
import SnackbarProvider from '@devist/ui-react/providers/SnackbarProvider';
import ThemeProvider from '@devist/ui-react/providers/ThemeProvider';

import AppRoutes from './routes/Routes';

const App: FC = () => {
	return (
		<QueryProvider queryClient={defaultQueryClient}>
			<ThemeProvider>
				<MotionLazy>
					<SnackbarProvider>
						<AppRoutes />
					</SnackbarProvider>
				</MotionLazy>
			</ThemeProvider>
		</QueryProvider>
	);
};

export default App;
