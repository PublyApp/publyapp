import { QueryClient } from '@tanstack/react-query';

const twentyFourHoursInMs = 1000 * 60 * 60 * 24;

export const getQueryClient = () => {
	const queryClient = new QueryClient({
		defaultOptions: {
			queries: {
				refetchOnWindowFocus: false,
				refetchOnReconnect: false,
				retry: false,
				staleTime: twentyFourHoursInMs,
			},
		},
	});

	return queryClient;
};
