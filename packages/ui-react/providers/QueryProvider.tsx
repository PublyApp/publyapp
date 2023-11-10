import { useState, type ReactNode } from 'react';

import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';

import defaultQueryClient from '@ui-react/lib/react-query/queryClient';

type Props = {
	children: ReactNode;
	queryClient?: QueryClient;
};

const QueryProvider = ({ children, queryClient: _queryClient }: Props) => {
	const [queryClient] = useState(_queryClient ?? defaultQueryClient);

	return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
};

export default QueryProvider;
