import { /* MutationCache, */ QueryClient } from '@tanstack/react-query';

const twentyFourHoursInMs = 1000 * 60 * 60 * 24;

export const createQueryClient = () => {
	const queryClient = new QueryClient({
		defaultOptions: {
			queries: {
				// refetchOnWindowFocus: false,
				// refetchOnReconnect: false,
				// retry: false,
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
