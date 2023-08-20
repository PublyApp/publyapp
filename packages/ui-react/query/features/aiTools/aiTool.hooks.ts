import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';

import { functionName } from '@aktiveo/shared/utils/constants';

import { getAIToolsAction, GetAIToolsQueryParams } from './aiTool.actions';

export const useGetAITools = (params: GetAIToolsQueryParams) => {
	const key = [functionName.getAITools, params] as const;

	const result = useQuery({
		queryKey: key,
		queryFn: getAIToolsAction,
		placeholderData: keepPreviousData,
	});

	return { result, key };
};

export const useCreateAITool = () => {
	const key = [functionName.createAITool] as const;

	const result = useMutation({
		mutationKey: key,
		mutationFn: createAIToolAction,
	});

	return { result, key };
};
