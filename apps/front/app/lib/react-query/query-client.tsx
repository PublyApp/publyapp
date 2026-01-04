import { QueryClient } from '@tanstack/react-query';

const FIVE_MINUTES_IN_MS = 1000 * 60 * 5;

type Options = {
	isDev?: boolean;
};

export const createQueryClient = ({ isDev = true }: Options = {}) => {
	const queryClient = new QueryClient({
		defaultOptions: {
			queries: {
				refetchOnWindowFocus: false,
				refetchOnReconnect: false,
				staleTime: FIVE_MINUTES_IN_MS,
				retry: (failureCount, _error) => {
					if (isDev) {
						return false;
					}

					// Retry the query up to 2 times
					// (i.e., allow the first two failures, no retry after the third failure)
					return failureCount <= 2;
				},
			},
		},
	});

	return queryClient;
};

export const defaultQueryClient = createQueryClient({
	isDev: import.meta.env.DEV,
});
