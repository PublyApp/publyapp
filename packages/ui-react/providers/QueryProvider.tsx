import { ReactNode, useState } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import defaultQueryClient from '../query/queryClient';

type Props = {
	children: ReactNode;
	queryClient?: QueryClient;
};

const QueryProvider = ({ children, queryClient: _queryClient }: Props) => {
	const [queryClient] = useState(_queryClient ?? defaultQueryClient);

	return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
};

export default QueryProvider;
