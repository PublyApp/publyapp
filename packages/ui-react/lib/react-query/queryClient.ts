import { /* MutationCache, */ QueryClient } from '@tanstack/react-query';

import { ClientException } from '@/ui-react/exceptions/ClientException';

const twentyFourHoursInMs = 1000 * 60 * 60 * 24;

export const createQueryClient = () => {
	const queryClient = new QueryClient({
		defaultOptions: {
			queries: {
				// refetchOnWindowFocus: false,
				// refetchOnReconnect: false,
				// retry: false
				retry: (failureCount, error) => {
					if (error instanceof ClientException) {
						if (error.code === ClientException.AUTH_REQUIRED) {
							return false;
						}
					}

					return failureCount <= 3;
				},
				staleTime: twentyFourHoursInMs,
			},
		},
		// mutationCache: new MutationCache({
		// 	onError(error, variables, context, mutation) {
		// 		toast(error);
		// 	},
		// })
	});

	return queryClient;
};

const defaultQueryClient = createQueryClient();

export default defaultQueryClient;
