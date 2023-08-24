import { ReactNode } from 'react';

import { QueryClient } from '@tanstack/react-query';

import AppProvider from '@aktiveo/ui-react/contexts/AppProvider';
import { AuthProvider } from '@aktiveo/ui-react/contexts/AuthProvider';
import QueryProvider from '@aktiveo/ui-react/providers/QueryProvider';
import ThemeProvider from '@aktiveo/ui-react/providers/ThemeProvider';

import { initParseVPSFront } from '../utils/initParseVPSFront';

type Props = {
	children: ReactNode;
	queryClient?: QueryClient;
};

initParseVPSFront();

const VPSFrontProvider = ({ children, queryClient }: Props) => {
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

export default VPSFrontProvider;
