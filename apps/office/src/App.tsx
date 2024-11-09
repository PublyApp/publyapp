import '@/ui-react/styles/fonts.css';

import { NuqsAdapter } from 'nuqs/adapters/react-router';

import MotionLazyContainer from '@/ui-react/components/MotionLazyContainer';
import MuiDatePickerLocalizationProvider from '@/ui-react/providers/MuiDatePickerLocalizationProvider';
import QueryClientProvider from '@/ui-react/providers/QueryClientProvider';
import SnackbarProvider from '@/ui-react/providers/SnackbarProvider';
import ThemeProvider from '@/ui-react/providers/ThemeProvider';

import Routes from './routes/Routes';

const App = () => {
	return (
		<QueryClientProvider>
			<MuiDatePickerLocalizationProvider>
				<ThemeProvider>
					<MotionLazyContainer>
						<SnackbarProvider>
							<NuqsAdapter>
								<Routes />
							</NuqsAdapter>
						</SnackbarProvider>
					</MotionLazyContainer>
				</ThemeProvider>
			</MuiDatePickerLocalizationProvider>
		</QueryClientProvider>
	);
};

export default App;
