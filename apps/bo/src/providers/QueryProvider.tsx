import { ReactNode, useState } from 'react';

import { QueryClientProvider } from '@tanstack/react-query';

import { getQueryClient } from '@aktiveo/ui-react/query/queryClient';

type Props = {
	children: ReactNode;
};

const QueryProvider = ({ children }: Props) => {
	const [queryClient] = useState(getQueryClient());

	return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
};

export default QueryProvider;
