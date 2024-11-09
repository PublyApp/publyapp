import { QueryClient } from '@tanstack/react-query';

const fiveMinsInMs = 1000 * 60 * 5;

type Options = {
	env?: 'production' | 'development';
};

export const createQueryClient = ({ env = 'development' }: Options = {}) => {
	const queryClient = new QueryClient({
		defaultOptions: {
			queries: {
				refetchOnWindowFocus: false,
				refetchOnReconnect: false,
				staleTime: fiveMinsInMs,
				retry: (failureCount, _error) => {
					if (env === 'development') {
						return false;
					}

					return failureCount <= 2;
				},
			},
		},
		// queryCache: new QueryCache({
		// 	onError: (error, query) => {
		// 		enqueueSnackbar(error);
		// 	},
		// }),
		// mutationCache: new MutationCache({
		// 	onError(error, variables, context, mutation) {
		// 		enqueueSnackbar(error);
		// 	},
		// })
	});

	return queryClient;
};

const defaultQueryClient = createQueryClient();

export default defaultQueryClient;
