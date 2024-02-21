import { useState, type ReactNode } from 'react';

import { QueryClientProvider as QueryProvider, type QueryClient } from '@tanstack/react-query';

import defaultQueryClient from '@/ui-react/lib/react-query/queryClient';

type Props = {
	children: ReactNode;
	queryClient?: QueryClient;
};

const QueryClientProvider = ({ children, queryClient }: Props) => {
	// eslint-disable-next-line @typescript-eslint/naming-convention
	const [_queryClient] = useState(queryClient || defaultQueryClient);

	return <QueryProvider client={_queryClient}>{children}</QueryProvider>;
};

export default QueryClientProvider;
