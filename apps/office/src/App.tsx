import '@devist/ui-react/styles/fonts.css';

import MotionLazyContainer from '@devist/ui-react/components/MotionLazyContainer';
import MuiDatePickerLocalizationProvider from '@devist/ui-react/providers/MuiDatePickerLocalizationProvider';
import QueryClientProvider from '@devist/ui-react/providers/QueryClientProvider';
import SnackbarProvider from '@devist/ui-react/providers/SnackbarProvider';
import ThemeProvider from '@devist/ui-react/providers/ThemeProvider';

import Routes from './routes/Routes';

const App = () => {
	return (
		<QueryClientProvider>
			<MuiDatePickerLocalizationProvider>
				<ThemeProvider>
					<MotionLazyContainer>
						<SnackbarProvider>
							<Routes />
						</SnackbarProvider>
					</MotionLazyContainer>
				</ThemeProvider>
			</MuiDatePickerLocalizationProvider>
		</QueryClientProvider>
	);
};

export default App;
