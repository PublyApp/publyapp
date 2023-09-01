import { FC } from 'react';

import '@aktiveo/ui-react/styles/fonts.css';

import AppRoutes from './AppRoutes';
import BOProviders from './providers/BOProviders';

const App: FC = () => {
	return (
		<BOProviders>
			<AppRoutes />
		</BOProviders>
	);
};

export default App;
