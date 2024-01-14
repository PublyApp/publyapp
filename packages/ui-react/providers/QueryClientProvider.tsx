import { useState, type ReactNode } from 'react';

import { QueryClientProvider as QueryProvider } from '@tanstack/react-query';

import defaultQueryClient from '@/ui-react/lib/react-query/queryClient';

type Props = {
	children: ReactNode;
};

const QueryClientProvider = ({ children }: Props) => {
	const [queryClient] = useState(defaultQueryClient);

	return <QueryProvider client={queryClient}>{children}</QueryProvider>;
};

export default QueryClientProvider;
