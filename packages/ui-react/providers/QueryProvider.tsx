import { useState, type ReactNode } from 'react';

import { QueryClientProvider } from '@tanstack/react-query';

import defaultQueryClient from '@/ui-react/lib/react-query/queryClient';

type Props = {
	children: ReactNode;
};

const QueryProvider = ({ children }: Props) => {
	const [queryClient] = useState(defaultQueryClient);

	return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
};

export default QueryProvider;
