import { /* MutationCache,  QueryCache, */ QueryClient } from '@tanstack/react-query';

import { ClientException } from '@/ui-react/exceptions/ClientException';

// const twentyFourHoursInMs = 1000 * 60 * 60 * 24;
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
				retry: (failureCount, error) => {
					if (env === 'development') {
						return false;
					}

					if (error instanceof ClientException) {
						if (error.code === ClientException.AUTH_REQUIRED) {
							return false;
						}
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
