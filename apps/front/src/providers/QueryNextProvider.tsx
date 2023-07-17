'use client';

import React from 'react';

import { QueryClientProvider } from '@tanstack/react-query';
// import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { ReactQueryStreamedHydration } from '@tanstack/react-query-next-experimental';

import { getQueryClient } from '@aktiveo/ui-react/query/queryClient';

const QueryNextProvider = ({ children }: React.PropsWithChildren) => {
	const [client] = React.useState(getQueryClient());

	return (
		<QueryClientProvider client={client}>
			<ReactQueryStreamedHydration>{children}</ReactQueryStreamedHydration>
			{/* <ReactQueryDevtools initialIsOpen={false} /> */}
		</QueryClientProvider>
	);
};

export default QueryNextProvider;
