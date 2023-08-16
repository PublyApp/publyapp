import { FC } from 'react';

import '@aktiveo/ui-react/styles/fonts.css';
import BOProviders from './providers/BOProviders';
import AppRoutes from './AppRoutes';

const App: FC = () => {
	return (
		<BOProviders>
			<AppRoutes />
		</BOProviders>
	);
};

export default App;
