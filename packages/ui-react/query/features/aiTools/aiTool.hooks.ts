import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { functionName } from '@aktiveo/shared/utils/constants';

import { GetAIToolsQueryParams, getAIToolsAction } from './aiTool.actions';

export const useGetAITools = (params: GetAIToolsQueryParams) => {
	const key = [functionName.getAITools, params] as const;

	const result = useQuery({
		queryKey: key,
		queryFn: getAIToolsAction,
		placeholderData: keepPreviousData,
	});

	return { result, key };
};
