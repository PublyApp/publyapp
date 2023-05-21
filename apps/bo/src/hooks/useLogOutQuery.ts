import { useQuery } from '@tanstack/react-query';

import { logOutFn } from '../reactQuery/queryFns/logOut.fn';

export const useLogOutQuery = () => {
	const {
		data: logOutResult,
		isLoading: isLogOutLoading,
		refetch: triggerLogOut,
		isSuccess: isLogOutSuccess,
		isFetching: isLogOutFetching,
	} = useQuery({
		queryKey: ['logOut'],
		queryFn: logOutFn,
		enabled: false,
		cacheTime: 0,
		retry: false,
	});

	return { logOutResult, triggerLogOut, isLogOutLoading, isLogOutSuccess, isLogOutFetching };
};
