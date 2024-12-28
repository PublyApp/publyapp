import { QueryClient } from '@tanstack/react-query';

const FIVE_MINUTES_IN_MS = 1000 * 60 * 5;

type Options = {
	env?: 'production' | 'development';
};

export const createQueryClient = ({ env = 'development' }: Options = {}) => {
	const queryClient = new QueryClient({
		defaultOptions: {
			queries: {
				refetchOnWindowFocus: false,
				refetchOnReconnect: false,
				staleTime: FIVE_MINUTES_IN_MS,
				retry: (failureCount, _error) => {
					if (env === 'development') {
						return false;
					}

					return failureCount <= 2;
				},
			},
		},
	});

	return queryClient;
};

export const defaultQueryClient = createQueryClient();
