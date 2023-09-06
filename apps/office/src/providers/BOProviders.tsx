import { ReactNode } from 'react';

import { QueryClient } from '@tanstack/react-query';

import ThemeProvider from '@aktiveo/ui-react/providers/ThemeProvider';
import { AuthProvider } from '@aktiveo/ui-react/contexts/AuthProvider';
import AppProvider from '@aktiveo/ui-react/contexts/AppProvider';
import QueryProvider from '@aktiveo/ui-react/providers/QueryProvider';

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
