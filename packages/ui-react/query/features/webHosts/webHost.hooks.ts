import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';

import { functionName } from '@devist/shared/utils/constants';

import { createWebHostAction, getWebHostsAction, type GetWebHostsQueryParams } from './webHost.actions';

export const useCreateWebHost = () => {
	const key = [functionName.createWebHost] as const;

	const result = useMutation({
		mutationKey: key,
		mutationFn: createWebHostAction,
	});

	return { result, key };
};

export const useGetWebHosts = (params: GetWebHostsQueryParams) => {
	const key = [functionName.getWebHosts, params] as const;

	const result = useQuery({
		queryKey: key,
		queryFn: getWebHostsAction,
		placeholderData: keepPreviousData,
	});

	return { result, key };
};
