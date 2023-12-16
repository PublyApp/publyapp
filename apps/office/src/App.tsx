import type { FC } from 'react';

import '@devist/ui-react/styles/fonts.css';

import MotionLazy from '@devist/ui-react/components/MotionLazy';
import MuiDatePickerLocalizationProvider from '@devist/ui-react/providers/MuiDatePickerLocalizationProvider';
import QueryProvider from '@devist/ui-react/providers/QueryProvider';
import SnackbarProvider from '@devist/ui-react/providers/SnackbarProvider';
import ThemeProvider from '@devist/ui-react/providers/ThemeProvider';

import AppRoutes from './routes/Routes';

const App: FC = () => {
	return (
		<QueryProvider>
			<MuiDatePickerLocalizationProvider>
				<ThemeProvider>
					<MotionLazy>
						<SnackbarProvider>
							<AppRoutes />
						</SnackbarProvider>
					</MotionLazy>
				</ThemeProvider>
			</MuiDatePickerLocalizationProvider>
		</QueryProvider>
	);
};

export default App;
