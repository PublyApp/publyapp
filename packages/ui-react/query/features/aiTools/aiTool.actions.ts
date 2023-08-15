import { QueryFunction } from '@tanstack/react-query';

import { functionName } from '@aktiveo/shared/utils/constants';
import { AITool } from '@aktiveo/shared/types/aiTool.types';

// --------------------------------------------------------------------------------------//
//                                                                                      //
//                                       QUERIES                                        //
//                                                                                      //
// --------------------------------------------------------------------------------------//
export type GetAIToolsQueryParams = {
	page: number;
	pageSize: number;
};

type GetAIToolsFunctionResult = {
	aiTools: AITool[];
	meta: {
		totalCount: number;
		count: number;
	};
};

export const getAIToolsAction: QueryFunction<
	GetAIToolsFunctionResult,
	readonly [typeof functionName.getAITools, GetAIToolsQueryParams]
> = async (context) => {
	try {
		const params = context.queryKey[1];

		const aiTools: GetAIToolsFunctionResult = await Parse.Cloud.run(functionName.getAITools, params);
		return aiTools;
	} catch (error) {
		console.log('----- getAIToolsAction error ----------', error);
		return Promise.reject(error);
	}
};

// --------------------------------------------------------------------------------------//
//                                                                                      //
//                                      MUTATIONS                                       //
//                                                                                      //
// --------------------------------------------------------------------------------------//
