import { ReactNode } from 'react';

import { QueryClient } from '@tanstack/react-query';

import AppProvider from '@aktiveo/ui-react/contexts/AppProvider';
import { AuthProvider } from '@aktiveo/ui-react/contexts/AuthProvider';
import QueryProvider from '@aktiveo/ui-react/providers/QueryProvider';
import ThemeProvider from '@aktiveo/ui-react/providers/ThemeProvider';

type Props = {
	children: ReactNode;
	queryClient?: QueryClient;
};

const BOProviders = ({ children, queryClient }: Props) => {
	return (
		<AuthProvider>
			<AppProvider>
				<ThemeProvider>
					<QueryProvider queryClient={queryClient}>{children}</QueryProvider>
				</ThemeProvider>
			</AppProvider>
		</AuthProvider>
	);
};

export default BOProviders;
